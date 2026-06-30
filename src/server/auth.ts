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
  deleteSession,
  findUserByEmail,
  getSessionUser,
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

function sessionSetCookie(token: string): SetCookieInstruction {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd(),
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
    if (key !== '') {
      out[key] = decodeURIComponent(val);
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
// Анти-брутфорс троттлинг (in-memory по ключу email+IP)
// ----------------------------------------------------------------------------

const MAX_FAILS = 5;
const BLOCK_MS = 15 * 60 * 1000;
/** Окно подсчёта неудач — сбрасывается при успехе/истечении блокировки. */
const FAIL_WINDOW_MS = 15 * 60 * 1000;

interface ThrottleEntry {
  fails: number;
  firstFailAt: number;
  blockedUntil: number;
}

const throttleMap = new Map<string, ThrottleEntry>();

function throttleKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

/** Проверить блокировку. Возвращает оставшиеся секунды блокировки или 0. */
function throttleRetryAfter(key: string): number {
  const e = throttleMap.get(key);
  if (!e) {
    return 0;
  }
  const now = Date.now();
  if (e.blockedUntil > now) {
    return Math.ceil((e.blockedUntil - now) / 1000);
  }
  return 0;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const e = throttleMap.get(key);
  if (!e || now - e.firstFailAt > FAIL_WINDOW_MS) {
    throttleMap.set(key, { fails: 1, firstFailAt: now, blockedUntil: 0 });
    return;
  }
  e.fails += 1;
  if (e.fails >= MAX_FAILS) {
    e.blockedUntil = now + BLOCK_MS;
  }
}

function resetThrottle(key: string): void {
  throttleMap.delete(key);
}

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

  const passwordHash = await hashPassword(password);

  try {
    const user = await createWebUser({
      email,
      username,
      passwordHash,
      firstName,
      lastName,
      pdnConsentVersion,
      marketingConsent,
      marketingConsentVersion,
    });

    const token = generateToken();
    await createSession(user.id, hashToken(token), new Date(Date.now() + SESSION_TTL_MS));

    return {
      status: 201,
      body: { user: publicUser(user) },
      cookies: [sessionSetCookie(token)],
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

  const key = throttleKey(email, ip);
  const retryAfter = throttleRetryAfter(key);
  if (retryAfter > 0) {
    return err(429, 'Слишком много попыток входа. Попробуйте позже.', {
      code: 'too_many_attempts',
      retryAfter,
    });
  }

  const user = await findUserByEmail(email);
  const ok = user !== null && (await verifyPassword(password, user.password_hash));

  if (!ok || user === null) {
    recordFailure(key);
    return err(401, 'Неверный email или пароль', { code: 'invalid_credentials' });
  }

  resetThrottle(key);

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
    cookies: [sessionSetCookie(token)],
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
