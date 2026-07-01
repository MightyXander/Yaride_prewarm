/**
 * Пользователи: браузерная регистрация (issue #242), JIT-профиль из Telegram,
 * профильные срезы (GET /api/me/profile, /api/users/:id/profile), телефон.
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';
import { internalUserIdByTg } from './_shared.ts';

// ============================================================================
// Браузерная авторизация (issue #242): email/пароль, согласия 152-ФЗ.
// ============================================================================

/** Публичный срез браузерного пользователя (без password_hash). */
export interface WebUserRecord {
  id: number;
  name: string;
  email: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

/** Конфликт уникальности при регистрации (машинно-различимый код для 409). */
export class UserConflictError extends Error {
  public readonly code: 'email_taken' | 'username_taken';
  constructor(code: 'email_taken' | 'username_taken') {
    super(code);
    this.name = 'UserConflictError';
    this.code = code;
  }
}

export interface CreateWebUserParams {
  email: string;
  username: string;
  /** Уже посчитанный scrypt-хеш (репозиторий пароль в открытом виде не видит). */
  passwordHash: string;
  firstName: string;
  lastName: string;
  pdnConsentVersion: string;
  marketingConsent: boolean;
  marketingConsentVersion?: string | null;
  /**
   * Если задано — сессия создаётся в ТОЙ ЖЕ транзакции, что и пользователь
   * (атомарность: при откате не остаётся «орфан»-аккаунт без сессии).
   */
  session?: { tokenHash: string; expiresAt: Date };
}

/** Занят ли email (регистронезависимо). */
export async function isEmailTaken(email: string): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    'SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [email],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Занят ли username среди ВЕБ-аккаунтов (регистронезависимо).
 *
 * Ограничение `password_hash IS NOT NULL` совпадает с уникальным индексом
 * uq_users_username_lower: users.username хранит снимки Telegram-ников, и веб-юзеру
 * разрешено взять ник, совпадающий с историческим TG-снимком; конфликт считаем
 * только между двумя веб-аккаунтами.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    'SELECT 1 FROM users WHERE lower(username) = lower($1) AND password_hash IS NOT NULL LIMIT 1',
    [username],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Создать браузерного пользователя (email/пароль + согласия 152-ФЗ).
 *
 * Инвариант «способ входа» гарантируется на уровне БД (CHECK users_login_method_check)
 * и здесь: всегда записываем email + password_hash. name — склейка first+last
 * (совместимость со всеми запросами поездок/броней, тянущими u.name).
 * Уникальность проверяется явно (для кодов email_taken/username_taken) и
 * дублируется уникальными индексами (catch 23505 как защита от гонок).
 */
export async function createWebUser(params: CreateWebUserParams): Promise<WebUserRecord> {
  await ensureReady();
  const email = params.email.trim();
  const username = params.username.trim();
  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();
  const name = [firstName, lastName].filter((p) => p.length > 0).join(' ') || username;

  const marketingAt = params.marketingConsent ? new Date() : null;
  const marketingVer = params.marketingConsent
    ? params.marketingConsentVersion?.trim() || params.pdnConsentVersion
    : null;

  return withTransaction(async (client): Promise<WebUserRecord> => {
    const emailRes = await client.query(
      'SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email],
    );
    if ((emailRes.rowCount ?? 0) > 0) {
      throw new UserConflictError('email_taken');
    }
    // Конфликт ника считаем только среди веб-аккаунтов (совпадает с uq_users_username_lower
    // и isUsernameTaken): веб-юзер вправе занять ник, совпадающий с TG-снимком.
    const unameRes = await client.query(
      'SELECT 1 FROM users WHERE lower(username) = lower($1) AND password_hash IS NOT NULL LIMIT 1',
      [username],
    );
    if ((unameRes.rowCount ?? 0) > 0) {
      throw new UserConflictError('username_taken');
    }

    try {
      const ins = await client.query<WebUserRecord>(
        `INSERT INTO users(name, email, username, password_hash, first_name, last_name,
                           pdn_consent_at, pdn_consent_version,
                           marketing_consent_at, marketing_consent_version)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)
         RETURNING id, name, email, username, first_name, last_name`,
        [
          name,
          email,
          username,
          params.passwordHash,
          firstName,
          lastName,
          params.pdnConsentVersion,
          marketingAt,
          marketingVer,
        ],
      );
      const user = ins.rows[0];

      // Атомарно создаём сессию в той же транзакции (нет «орфан»-аккаунта при откате).
      if (params.session) {
        await client.query(
          'INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
          [params.session.tokenHash, user.id, params.session.expiresAt],
        );
      }

      return user;
    } catch (e) {
      // Гонка: уникальный индекс сработал между проверкой и вставкой.
      const constraint = (e as { code?: string; constraint?: string });
      if (constraint.code === '23505') {
        if (constraint.constraint === 'uq_users_username_lower') {
          throw new UserConflictError('username_taken');
        }
        throw new UserConflictError('email_taken');
      }
      throw e;
    }
  });
}

/** Пользователь с хешем пароля по email (регистронезависимо) — для проверки входа. */
export async function findUserByEmail(
  email: string,
): Promise<(WebUserRecord & { password_hash: string }) | null> {
  await ensureReady();
  const res = await getPool().query<WebUserRecord & { password_hash: string | null }>(
    `SELECT id, name, email, username, first_name, last_name, password_hash
     FROM users
     WHERE lower(email) = lower($1) AND password_hash IS NOT NULL
     LIMIT 1`,
    [email],
  );
  const row = res.rows[0];
  if (!row || row.password_hash === null) {
    return null;
  }
  return { ...row, password_hash: row.password_hash };
}

// ============================================================================
// JIT-профиль из Telegram + карточки профиля.
// ============================================================================

export interface EnsureUserParams {
  tgUserId: number;
  name: string;
  username?: string | null;
  age?: number | null;
}

export interface UserRecord {
  id: number;
  tg_user_id: number;
  name: string;
  username: string | null;
  age: number | null;
}

/**
 * JIT-профиль: резолв пользователя по telegram_id, создание при первом
 * обращении (имя из Telegram initData). Идемпотентно через ON CONFLICT.
 * Имя/username обновляются на актуальные из initData; возраст не перетираем.
 */
export async function ensureUser(params: EnsureUserParams): Promise<UserRecord> {
  await ensureReady();
  const name = params.name.trim() || 'Пассажир';
  const username = params.username?.trim() || null;
  const age = params.age ?? null;

  const res = await getPool().query<UserRecord>(
    `INSERT INTO users(tg_user_id, name, username, age)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tg_user_id) DO UPDATE
       SET name = EXCLUDED.name,
           username = COALESCE(EXCLUDED.username, users.username),
           age = COALESCE(users.age, EXCLUDED.age)
     RETURNING id, tg_user_id, name, username, age`,
    [params.tgUserId, name, username, age],
  );
  return res.rows[0];
}

export interface UserProfile {
  id: number;
  tg_user_id: number;
  name: string;
  username: string | null;
  age: number | null;
  rating_avg: number;
  rating_count: number;
  trips_driver_count: number;
  trips_passenger_count: number;
  license_status: string;
}

/**
 * Профиль пользователя по telegram-id (для GET /api/me/profile).
 * Возвращает null если пользователь не найден.
 */
export async function getUserProfile(tgUserId: number): Promise<UserProfile | null> {
  const id = await internalUserIdByTg(tgUserId);
  return id === null ? null : getUserProfileById(id);
}

/** Профиль по внутреннему users.id (мост сессионного клиента, issue #258). */
export async function getUserProfileById(internalId: number): Promise<UserProfile | null> {
  await ensureReady();
  const res = await getPool().query<UserProfile>(
    `SELECT id, tg_user_id, name, username, age, rating_avg, rating_count,
            trips_driver_count, trips_passenger_count, license_status
     FROM users WHERE id = $1`,
    [internalId],
  );
  return res.rows[0] ?? null;
}

/**
 * Телефон пользователя по внутреннему id (для префилла на экранах брони/публикации).
 * Возвращает нормализованный номер или null, если он ещё не задан.
 */
export async function getUserPhoneById(userId: number): Promise<string | null> {
  await ensureReady();
  const res = await getPool().query<{ phone: string | null }>(
    'SELECT phone FROM users WHERE id = $1',
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return row.phone ?? null;
}

/**
 * Сохранить/обновить телефон пользователя (сбор «по требованию», issue #267).
 * Номер ожидается уже нормализованным (+7XXXXXXXXXX). Возвращает false, если
 * пользователь не найден.
 */
export async function updateUserPhone(userId: number, phone: string): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    'UPDATE users SET phone = $2 WHERE id = $1',
    [userId, phone],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface PublicUserProfile {
  id: number;
  name: string;
  age: number | null;
  trips_count: number;
  rating: number;
  rating_count: number;
  joined_at: string;
  is_driver: boolean;
  license_verified: boolean;
}

/**
 * Публичный профиль пользователя по внутреннему id (для GET /api/users/:id/profile).
 * Возвращает null если пользователь не найден.
 */
export async function getPublicUserProfile(userId: number): Promise<PublicUserProfile | null> {
  await ensureReady();
  const res = await getPool().query<{
    id: number;
    name: string;
    age: number | null;
    trips_driver_count: number;
    trips_passenger_count: number;
    rating_avg: number;
    rating_count: number;
    created_at: string;
    license_status: string;
  }>(
    `SELECT id, name, age, trips_driver_count, trips_passenger_count, rating_avg, rating_count, created_at, license_status
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    trips_count: row.trips_driver_count + row.trips_passenger_count,
    rating: row.rating_avg,
    rating_count: row.rating_count,
    joined_at: row.created_at,
    is_driver: row.trips_driver_count > 0,
    license_verified: row.license_status === 'verified',
  };
}
