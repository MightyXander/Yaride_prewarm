/**
 * Браузерная авторизация (issue #242): регистрация/вход по email+пароль,
 * сессии в httpOnly-cookie, согласия 152-ФЗ, анти-брутфорс троттлинг.
 *
 * Express-независимые обработчики (как в api.ts): принимают ApiRequest, возвращают
 * ApiResponse. Cookie ставятся через ApiResponse.cookies (тонкая обёртка в server.js).
 *
 * Безопасность:
 *  - Пароль: scrypt (node:crypto) с случайной солью (randomBytes) и timingSafeEqual
 *    при проверке. Формат хранения: `scrypt$N$r$p$<saltHex>$<hashHex>`.
 *  - Токен сессии: 32 случайных байта (opaque), в БД хранится только его sha256-хеш.
 *  - Пароли/токены/секреты НЕ логируются.
 */

import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from 'node:crypto';

import {
  createSession,
  createWebUser,
  deleteExpiredSessions,
  deleteSession,
  findUserByEmail,
  getSessionUser,
  isEmailTaken,
  isUsernameTaken,
  UserConflictError,
  type WebUserRecord,
} from './repo.ts';
import type { ApiRequest, ApiResponse, SetCookieInstruction } from './api.ts';

// ----------------------------------------------------------------------------
// Хеширование пароля (scrypt)
// ----------------------------------------------------------------------------

/** Параметры scrypt. N=16384 (cost), r=8, p=1, keylen=64. maxmem с запасом. */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(derivedKey);
        }
      },
    );
  });
}

/** Хеш пароля: `scrypt$N$r$p$<saltHex>$<hashHex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Проверка пароля против хранимого хеша (constant-time). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, , , , saltHex, hashHex] = parts;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) {
    return false;
  }
  const derived = await scryptAsync(password, salt);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Постоянный dummy-хеш для login по несуществующему email: verifyPassword против
 * него выполняет тот же scrypt, что и реальная проверка, выравнивая время ответа
 * (защита от тайминговой user-enumeration). Считается один раз лениво.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (dummyHashPromise === null) {
    dummyHashPromise = hashPassword(randomBytes(16).toString('hex'));
  }
  return dummyHashPromise;
}

// ----------------------------------------------------------------------------
// Сессии и cookie
// ----------------------------------------------------------------------------

const SESSION_COOKIE = 'yaride_session';
/** Срок жизни сессии — 30 дней. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Сгенерировать opaque-токен сессии (hex, 32 байта). */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** sha256-хеш токена (в БД хранится только он). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Прод? Для флага Secure у cookie. */
function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Нужен ли флаг Secure у cookie. true если запрос пришёл по https
 * (X-Forwarded-Proto=https за Caddy) ИЛИ это прод. За Caddy внешний коннект
 * всегда TLS, поэтому cookie получает Secure; локальный dev по http — нет.
 */
function cookieSecure(req: ApiRequest): boolean {
  const xfp = req.headers['x-forwarded-proto'] ?? req.headers['X-Forwarded-Proto'];
  const proto = typeof xfp === 'string' ? xfp.split(',')[0].trim().toLowerCase() : '';
  return proto === 'https' || isProd();
}

function sessionSetCookie(token: string, secure: boolean): SetCookieInstruction {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_TTL_MS,
    },
  };
}

function sessionClearCookie(): SetCookieInstruction {
  return { name: SESSION_COOKIE, value: null, options: { path: '/' } };
}

/** Ручной разбор заголовка Cookie (cookie-parser не используем). */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key === '') {
      continue;
    }
    // Битый percent-encoding (например "%E0%A4%A") бросает URIError в
    // decodeURIComponent. Не валим запрос 500 — просто пропускаем этот cookie
    // (для сессии это эквивалентно её отсутствию → 401 на /me, идемпотентный logout).
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      // пропускаем некорректно закодированный cookie
    }
  }
  return out;
}

/** Достать токен сессии из заголовка Cookie запроса. */
function readSessionToken(req: ApiRequest): string | null {
  const cookieHeader = req.headers['cookie'] ?? req.headers['Cookie'];
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE];
  return token && token.length > 0 ? token : null;
}

// ----------------------------------------------------------------------------
// Анти-брутфорс троттлинг (in-memory)
//
// Ключи зависят от req.ip. За Caddy Express должен доверять одному прокси-хопу
// (app.set('trust proxy', 1) в server.js), иначе req.ip = адрес Caddy и троттлинг
// на login по ключу email|ip залочил бы всех пользователей глобально (account-lockout
// DoS). С trust proxy=1 req.ip берётся из последнего значения X-Forwarded-For,
// проставляемого Caddy → ключ привязан к реальному клиенту.
// ----------------------------------------------------------------------------

interface ThrottlePolicy {
  /** Сколько событий в окне до блокировки. */
  maxFails: number;
  /** Длительность блокировки после превышения. */
  blockMs: number;
  /** Окно подсчёта событий. */
  windowMs: number;
}

/** Login: 5 неудачных входов за 15 мин → блок на 15 мин. */
const LOGIN_POLICY: ThrottlePolicy = {
  maxFails: 5,
  blockMs: 15 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
};

/** Register: 10 попыток с одного IP за 15 мин → блок на 15 мин (анти-DoS на scrypt). */
const REGISTER_POLICY: ThrottlePolicy = {
  maxFails: 10,
  blockMs: 15 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
};

interface ThrottleEntry {
  fails: number;
  firstFailAt: number;
  blockedUntil: number;
  /** Момент, после которого запись бесполезна и удаляется (lazy + sweeper). */
  expiresAt: number;
}

const throttleMap = new Map<string, ThrottleEntry>();

function loginKey(email: string, ip: string): string {
  return `login|${email.toLowerCase()}|${ip}`;
}

function registerKey(ip: string): string {
  return `register|${ip}`;
}

/**
 * Оставшиеся секунды блокировки по ключу, либо 0.
 * Лениво удаляет полностью просроченную запись (защита от роста Map).
 */
function throttleRetryAfter(key: string): number {
  const e = throttleMap.get(key);
  if (!e) {
    return 0;
  }
  const now = Date.now();
  if (now >= e.expiresAt) {
    throttleMap.delete(key);
    return 0;
  }
  if (e.blockedUntil > now) {
    return Math.ceil((e.blockedUntil - now) / 1000);
  }
  return 0;
}

function recordFailure(key: string, policy: ThrottlePolicy): void {
  const now = Date.now();
  const e = throttleMap.get(key);
  if (!e || now - e.firstFailAt > policy.windowMs) {
    throttleMap.set(key, {
      fails: 1,
      firstFailAt: now,
      blockedUntil: 0,
      expiresAt: now + policy.windowMs,
    });
    return;
  }
  e.fails += 1;
  e.expiresAt = Math.max(e.expiresAt, now + policy.windowMs);
  if (e.fails >= policy.maxFails) {
    e.blockedUntil = now + policy.blockMs;
    e.expiresAt = Math.max(e.expiresAt, e.blockedUntil);
  }
}

function resetThrottle(key: string): void {
  throttleMap.delete(key);
}

// Периодический sweeper: подчищает просроченные записи троттлинга и сессии в БД.
// unref() — таймер не держит процесс от штатного завершения (важно для тестов/CLI).
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const throttleSweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, e] of throttleMap) {
    if (now >= e.expiresAt) {
      throttleMap.delete(key);
    }
  }
  // Просроченные сессии (крона нет) — best-effort, ошибки не критичны.
  void deleteExpiredSessions().catch((err) => {
    console.error('[auth sweeper] deleteExpiredSessions:', err?.message ?? err);
  });
}, SWEEP_INTERVAL_MS);
throttleSweeper.unref();

// ----------------------------------------------------------------------------
// Валидация
// ----------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function err(status: number, error: string, extra?: Record<string, unknown>): ApiResponse {
  return { status, body: { error, ...extra } };
}

/** Публичный профиль для ответов авторизации. */
function publicUser(u: WebUserRecord): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    first_name: u.first_name,
    last_name: u.last_name,
  };
}

// ----------------------------------------------------------------------------
// Обработчики
// ----------------------------------------------------------------------------

/**
 * POST /api/auth/register
 * Body: { email, password, username, firstName, lastName,
 *         pdnConsent: true, pdnConsentVersion, marketingConsent?, marketingConsentVersion? }
 */
export async function handleRegister(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);
  const ip = req.ip ?? 'unknown';

  // Анти-DoS: rate-limit по IP ДО любой тяжёлой работы (scrypt).
  const rlKey = registerKey(ip);
  const rlRetry = throttleRetryAfter(rlKey);
  if (rlRetry > 0) {
    return err(429, 'Слишком много попыток регистрации. Попробуйте позже.', {
      code: 'too_many_attempts',
      retryAfter: rlRetry,
    });
  }
  recordFailure(rlKey, REGISTER_POLICY);

  const email = asString(body.email).trim();
  const password = asString(body.password);
  const username = asString(body.username).trim();
  const firstName = asString(body.firstName).trim();
  const lastName = asString(body.lastName).trim();
  const pdnConsent = body.pdnConsent === true;
  const pdnConsentVersion = asString(body.pdnConsentVersion).trim();
  const marketingConsent = body.marketingConsent === true;
  const marketingConsentVersion = asString(body.marketingConsentVersion).trim() || null;

  if (!EMAIL_RE.test(email)) {
    return err(400, 'Введите корректный email', { field: 'email' });
  }
  if (password.length < 8) {
    return err(400, 'Пароль должен быть не короче 8 символов', { field: 'password' });
  }
  if (!USERNAME_RE.test(username)) {
    return err(400, 'Ник: только латиница, цифры и _', { field: 'username' });
  }
  if (firstName === '') {
    return err(400, 'Укажите имя', { field: 'firstName' });
  }
  if (lastName === '') {
    return err(400, 'Укажите фамилию', { field: 'lastName' });
  }
  if (!pdnConsent) {
    return err(400, 'Требуется согласие на обработку персональных данных', { field: 'pdnConsent' });
  }
  if (pdnConsentVersion === '') {
    return err(400, 'Не указана версия политики обработки ПДн', { field: 'pdnConsentVersion' });
  }

  // Cheap-win: проверяем занятость email/username ДО scrypt — не жжём CPU/RAM на
  // заведомо конфликтных регистрациях. Гонку добивает уникальный индекс + catch 23505
  // в createWebUser (ниже).
  if (await isEmailTaken(email)) {
    return err(409, 'Такой email уже зарегистрирован', { code: 'email_taken' });
  }
  if (await isUsernameTaken(username)) {
    return err(409, 'Этот ник уже занят', { code: 'username_taken' });
  }

  const passwordHash = await hashPassword(password);
  const token = generateToken();

  try {
    // user + session в одной транзакции (атомарность — нет «орфан»-аккаунта).
    const user = await createWebUser({
      email,
      username,
      passwordHash,
      firstName,
      lastName,
      pdnConsentVersion,
      marketingConsent,
      marketingConsentVersion,
      session: {
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return {
      status: 201,
      body: { user: publicUser(user) },
      cookies: [sessionSetCookie(token, cookieSecure(req))],
    };
  } catch (e) {
    if (e instanceof UserConflictError) {
      const message =
        e.code === 'email_taken'
          ? 'Такой email уже зарегистрирован'
          : 'Этот ник уже занят';
      return err(409, message, { code: e.code });
    }
    throw e;
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }. Троттлинг по email+IP после серии неудач.
 */
export async function handleLogin(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);
  const email = asString(body.email).trim();
  const password = asString(body.password);
  const ip = req.ip ?? 'unknown';

  if (!EMAIL_RE.test(email) || password.length === 0) {
    return err(400, 'Укажите email и пароль');
  }

  const key = loginKey(email, ip);
  const retryAfter = throttleRetryAfter(key);
  if (retryAfter > 0) {
    return err(429, 'Слишком много попыток входа. Попробуйте позже.', {
      code: 'too_many_attempts',
      retryAfter,
    });
  }

  const user = await findUserByEmail(email);
  // При отсутствии пользователя всё равно гоняем scrypt по dummy-хешу — постоянное
  // время ответа, чтобы нельзя было различить «нет такого email» по тайму.
  let ok: boolean;
  if (user !== null) {
    ok = await verifyPassword(password, user.password_hash);
  } else {
    await verifyPassword(password, await getDummyHash());
    ok = false;
  }

  if (!ok || user === null) {
    recordFailure(key, LOGIN_POLICY);
    return err(401, 'Неверный email или пароль', { code: 'invalid_credentials' });
  }

  resetThrottle(key);

  // Лениво подчищаем просроченные сессии при успешном входе (best-effort).
  void deleteExpiredSessions().catch(() => {});

  const token = generateToken();
  await createSession(user.id, hashToken(token), new Date(Date.now() + SESSION_TTL_MS));

  return {
    status: 200,
    body: {
      user: publicUser({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
      }),
    },
    cookies: [sessionSetCookie(token, cookieSecure(req))],
  };
}

/** POST /api/auth/logout — удалить сессию и очистить cookie. */
export async function handleLogout(req: ApiRequest): Promise<ApiResponse> {
  const token = readSessionToken(req);
  if (token !== null) {
    await deleteSession(hashToken(token));
  }
  return {
    status: 200,
    body: { ok: true },
    cookies: [sessionClearCookie()],
  };
}

/** GET /api/auth/me — текущий пользователь по cookie-сессии, либо 401. */
export async function handleMe(req: ApiRequest): Promise<ApiResponse> {
  const token = readSessionToken(req);
  if (token === null) {
    return err(401, 'Не авторизован', { code: 'unauthorized' });
  }
  const user = await getSessionUser(hashToken(token));
  if (user === null) {
    return err(401, 'Сессия недействительна', { code: 'unauthorized' });
  }
  return { status: 200, body: { user: publicUser(user) } };
}
