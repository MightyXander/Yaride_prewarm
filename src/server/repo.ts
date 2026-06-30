/**
 * Repo-слой доступа к данным (по образцу MightyXander/Yaride app/repo.py).
 *
 * PostgreSQL/node-postgres, async. Под MVP «Один туннель»: список поездок по
 * коридору/окну на дату, карточка поездки с профилем водителя, создание брони
 * с защитой от гонок за места (транзакция BEGIN/COMMIT + условный UPDATE ...
 * RETURNING), справочник точек. Эти функции потребуются API в следующем issue.
 */

import type { PoolClient } from 'pg';

import { ensureReady, getPool, withTransaction } from './db.ts';
import { todayISO } from './seed.ts';

// ============================================================================
// Браузерная авторизация (issue #242): email/пароль, сессии, согласия 152-ФЗ.
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

/** Создать сессию (хранится только sha256-хеш opaque-токена). */
export async function createSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await ensureReady();
  await getPool().query(
    'INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, userId, expiresAt],
  );
}

/** Пользователь активной (непросроченной) сессии по хешу токена, или null. */
export async function getSessionUser(tokenHash: string): Promise<WebUserRecord | null> {
  await ensureReady();
  const res = await getPool().query<WebUserRecord>(
    `SELECT u.id, u.name, u.email, u.username, u.first_name, u.last_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

/** Удалить сессию по хешу токена (logout). Идемпотентно. */
export async function deleteSession(tokenHash: string): Promise<void> {
  await ensureReady();
  await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

/**
 * Удалить просроченные сессии (крона нет — чистим лениво при логине и из sweeper'а).
 * Возвращает число удалённых строк. Идемпотентно.
 */
export async function deleteExpiredSessions(): Promise<number> {
  await ensureReady();
  const res = await getPool().query('DELETE FROM sessions WHERE expires_at < now()');
  return res.rowCount ?? 0;
}

/**
 * Уже задан вход по email (есть password_hash) у аккаунта, к которому пытаются
 * добавить email/пароль. Управление/смена пароля — вне MVP (issue #273), поэтому
 * повторная установка → 409 already_set.
 */
export class CredentialsAlreadySetError extends Error {
  constructor() {
    super('credentials_already_set');
    this.name = 'CredentialsAlreadySetError';
  }
}

/** Срез учётных данных текущего пользователя для UI (без password_hash). */
export interface UserCredentialsStatus {
  /** true — вход по email уже настроен (password_hash IS NOT NULL). */
  hasPassword: boolean;
  email: string | null;
  username: string | null;
}

/**
 * Статус учётных данных пользователя по внутреннему id (для GET /api/me/credentials).
 * Возвращает null, если пользователь не найден. hasPassword нужен фронту, чтобы
 * показать секцию «Вход по email» только аккаунтам без пароля; username — префилл.
 */
export async function getUserCredentials(
  userId: number,
): Promise<UserCredentialsStatus | null> {
  await ensureReady();
  const res = await getPool().query<{
    email: string | null;
    username: string | null;
    password_hash: string | null;
  }>(
    'SELECT email, username, password_hash FROM users WHERE id = $1',
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return {
    hasPassword: row.password_hash !== null,
    email: row.email,
    username: row.username,
  };
}

export interface AddCredentialsParams {
  userId: number;
  email: string;
  username: string;
  /** Уже посчитанный scrypt-хеш (репозиторий пароль в открытом виде не видит). */
  passwordHash: string;
}

/**
 * Добавить вход по email (email + username + password_hash) к СУЩЕСТВУЮЩЕМУ
 * аккаунту без пароля (TG→браузер, issue #273). Единая users-карточка: рейтинг,
 * поездки и tg_user_id сохраняются — добавляются только поля веб-входа.
 *
 * Инварианты:
 *  - Применимо только к аккаунту с password_hash IS NULL; иначе CredentialsAlreadySetError
 *    (управление/смена — вне MVP). Строка блокируется FOR UPDATE, чтобы две
 *    параллельные установки не прошли обе.
 *  - email уникален среди ВСЕХ аккаунтов (uq_users_email_lower, email IS NOT NULL).
 *  - username уникален среди ВЕБ-аккаунтов (uq_users_username_lower, password_hash IS NOT NULL):
 *    как только мы проставляем password_hash, строка попадает под этот индекс, поэтому
 *    username обязателен и должен быть свободен среди веб-аккаунтов (совпадение с
 *    историческим TG-снимком другого пользователя — допустимо).
 *  - Конфликты дублируются уникальными индексами (catch 23505 как защита от гонок).
 */
export async function addUserCredentials(
  params: AddCredentialsParams,
): Promise<WebUserRecord> {
  await ensureReady();
  const email = params.email.trim();
  const username = params.username.trim();

  return withTransaction(async (client): Promise<WebUserRecord> => {
    const cur = await client.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
      [params.userId],
    );
    const row = cur.rows[0];
    if (!row) {
      throw new Error('Профиль не найден.');
    }
    if (row.password_hash !== null) {
      throw new CredentialsAlreadySetError();
    }

    // email: уникальность среди всех аккаунтов (исключая себя — у TG-строки email=NULL).
    const emailRes = await client.query(
      'SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1',
      [email, params.userId],
    );
    if ((emailRes.rowCount ?? 0) > 0) {
      throw new UserConflictError('email_taken');
    }
    // username: конфликт только среди ВЕБ-аккаунтов (совпадает с uq_users_username_lower).
    const unameRes = await client.query(
      'SELECT 1 FROM users WHERE lower(username) = lower($1) AND password_hash IS NOT NULL AND id <> $2 LIMIT 1',
      [username, params.userId],
    );
    if ((unameRes.rowCount ?? 0) > 0) {
      throw new UserConflictError('username_taken');
    }

    try {
      const upd = await client.query<WebUserRecord>(
        `UPDATE users
            SET email = $1, username = $2, password_hash = $3
          WHERE id = $4 AND password_hash IS NULL
        RETURNING id, name, email, username, first_name, last_name`,
        [email, username, params.passwordHash, params.userId],
      );
      const updated = upd.rows[0];
      if (!updated) {
        // Гонка: password_hash проставили между SELECT FOR UPDATE и UPDATE.
        throw new CredentialsAlreadySetError();
      }
      return updated;
    } catch (e) {
      const constraint = e as { code?: string; constraint?: string };
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

export type TimeSlot = 'morning' | 'evening';

export interface TripListItem {
  id: number;
  driver_id: number;
  time_slot: TimeSlot;
  trip_date: string;
  departure_time: string;
  price_rub: number;
  seats_total: number;
  seats_booked: number;
  seats_available: number;
  status: string;
  start_point_id: number;
  end_point_id: number;
  start_title: string;
  end_title: string;
  driver_name: string;
  driver_age: number | null;
  driver_rating: number;
  driver_rating_count: number;
  driver_trips_count: number;
  driver_license_status: string;
  is_own: boolean;
  car_model: string | null;
  car_color: string | null;
  plate: string | null;
}

export interface TripCard extends TripListItem {
  comment: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  driver_username: string | null;
  driver_created_at: string;
  driver_tg_user_id: number;
  /** Телефон водителя — раскрывается пассажиру с активной бронью (тот же accessCond, что и plate), иначе NULL. */
  driver_phone: string | null;
  /** true — у водителя есть телефон, но он скрыт (нет активной брони). UI показывает locked-подпись. */
  driver_phone_locked?: boolean;
}

export interface BookingResult {
  bookingId: number;
  tripId: number;
  seatsAvailable: number;
}

export interface FindTripsParams {
  startPointId?: number;
  endPointId?: number;
  timeSlot?: TimeSlot;
  /** Дата YYYY-MM-DD; по умолчанию — сегодня. */
  tripDate?: string;
  limit?: number;
  /** Внутренний user.id для определения is_own (опционально). */
  currentUserId?: number;
}

function buildTripListSelect(currentUserId?: number): string {
  const isOwnExpr = currentUserId !== undefined
    ? `(t.driver_id = ${currentUserId}) AS is_own`
    : `false AS is_own`;

  return `
  SELECT
    t.id,
    t.driver_id,
    t.time_slot,
    t.trip_date,
    t.departure_time,
    t.price_rub,
    t.seats_total,
    t.seats_booked,
    (t.seats_total - t.seats_booked) AS seats_available,
    t.status,
    t.start_point_id,
    t.end_point_id,
    sp.title AS start_title,
    ep.title AS end_title,
    u.name AS driver_name,
    u.age AS driver_age,
    u.rating_avg AS driver_rating,
    u.rating_count AS driver_rating_count,
    u.trips_driver_count AS driver_trips_count,
    u.license_status AS driver_license_status,
    t.car_model,
    t.car_color,
    -- Госномер в фиде НЕ раскрываем: «доверенный контур» — номер виден только
    -- после подтверждения брони (в деталях поездки). Здесь всегда NULL.
    NULL AS plate,
    ${isOwnExpr}
  FROM trips t
  JOIN route_points sp ON sp.id = t.start_point_id
  JOIN route_points ep ON ep.id = t.end_point_id
  JOIN users u ON u.id = t.driver_id
`;
}

/**
 * Поездки по коридору/окну на дату (status='open'), есть свободные места.
 * Любой из фильтров опционален; без startPointId/endPointId — все открытые на дату.
 */
export async function findOpenTrips(
  params: FindTripsParams = {},
): Promise<TripListItem[]> {
  await ensureReady();
  const tripDate = params.tripDate ?? todayISO();
  const limit = params.limit ?? 25;

  const selectPart = buildTripListSelect(params.currentUserId);
  // Не показываем в коридоре поездки, чьё время выезда уже прошло: для поездок
  // сегодняшней даты требуем departure_time >= текущего времени. departure_time —
  // TEXT 'HH:MM' с ведущими нулями, поэтому лексикографическое сравнение совпадает
  // с хронологическим. Часы берём из серверного now()/CURRENT_DATE — той же базы,
  // что и todayISO() для $1 (если сервер не в локальной TZ, сдвигать нужно их вместе).
  let query = `${selectPart}
    WHERE t.status = 'open'
      AND t.trip_date = $1
      AND (t.seats_total - t.seats_booked) > 0
      AND (t.trip_date <> CURRENT_DATE OR t.departure_time >= to_char(now(), 'HH24:MI'))`;
  const args: (string | number)[] = [tripDate];

  if (params.startPointId !== undefined) {
    args.push(params.startPointId);
    query += ` AND t.start_point_id = $${args.length}`;
  }
  if (params.endPointId !== undefined) {
    args.push(params.endPointId);
    query += ` AND t.end_point_id = $${args.length}`;
  }
  if (params.timeSlot !== undefined) {
    args.push(params.timeSlot);
    query += ` AND t.time_slot = $${args.length}`;
  }

  args.push(limit);
  query += ` ORDER BY t.departure_time ASC, t.id ASC LIMIT $${args.length}`;

  const res = await getPool().query<TripListItem>(query, args);
  return res.rows;
}

/** Карточка поездки по id с профилем водителя и координатами точек (или null). */
export async function getTripCard(tripId: number, currentUserId?: number): Promise<TripCard | null> {
  await ensureReady();
  const isOwnExpr = currentUserId !== undefined
    ? `(t.driver_id = ${currentUserId}) AS is_own`
    : `false AS is_own`;

  // «Доверенный контур»: реальный госномер виден только водителю поездки ИЛИ
  // пассажиру с активной бронью. Остальным — NULL + флаг plate_locked, чтобы UI
  // показал бэйдж с серой цензурой («откроется после бронирования»), а не пустоту.
  const accessCond = currentUserId !== undefined
    ? `(t.driver_id = ${currentUserId} OR EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.trip_id = t.id AND b.passenger_id = ${currentUserId} AND b.status = 'active'
       ))`
    : `false`;

  const query = `
    SELECT
      t.id,
      t.driver_id,
      t.time_slot,
      t.trip_date,
      t.departure_time,
      t.price_rub,
      t.seats_total,
      t.seats_booked,
      (t.seats_total - t.seats_booked) AS seats_available,
      t.status,
      t.comment,
      t.car_model,
      t.car_color,
      CASE WHEN ${accessCond} THEN t.plate ELSE NULL END AS plate,
      (t.plate IS NOT NULL AND NOT ${accessCond}) AS plate_locked,
      -- Телефон водителя — тот же «доверенный контур», что и госномер: реальный
      -- номер виден водителю поездки ИЛИ пассажиру с активной бронью; остальным
      -- NULL + флаг driver_phone_locked для мягкой подписи в UI.
      CASE WHEN ${accessCond} THEN u.phone ELSE NULL END AS driver_phone,
      (u.phone IS NOT NULL AND NOT ${accessCond}) AS driver_phone_locked,
      t.start_point_id,
      t.end_point_id,
      sp.title AS start_title,
      ep.title AS end_title,
      sp.latitude AS start_lat,
      sp.longitude AS start_lng,
      ep.latitude AS end_lat,
      ep.longitude AS end_lng,
      u.name AS driver_name,
      u.username AS driver_username,
      u.age AS driver_age,
      u.rating_avg AS driver_rating,
      u.rating_count AS driver_rating_count,
      u.trips_driver_count AS driver_trips_count,
      u.license_status AS driver_license_status,
      u.created_at AS driver_created_at,
      u.tg_user_id AS driver_tg_user_id,
      ${isOwnExpr}
    FROM trips t
    JOIN route_points sp ON sp.id = t.start_point_id
    JOIN route_points ep ON ep.id = t.end_point_id
    JOIN users u ON u.id = t.driver_id
    WHERE t.id = $1
  `;
  const res = await getPool().query<TripCard>(query, [tripId]);
  return res.rows[0] ?? null;
}

/** Все точки коридора (справочник route_points). */
export async function listRoutePoints(): Promise<
  Array<{
    id: number;
    locality: string;
    district: string;
    admin_area: string;
    title: string;
    kind: string;
    latitude: number | null;
    longitude: number | null;
  }>
> {
  await ensureReady();
  const res = await getPool().query<{
    id: number;
    locality: string;
    district: string;
    admin_area: string;
    title: string;
    kind: string;
    latitude: number | null;
    longitude: number | null;
  }>(
    'SELECT id, locality, district, admin_area, title, kind, latitude, longitude FROM route_points ORDER BY id ASC',
  );
  return res.rows;
}

/** Получить внутренний user.id по telegram-id (или null). */
async function getInternalUserId(
  client: PoolClient,
  tgUserId: number,
): Promise<number | null> {
  const res = await client.query<{ id: number }>(
    'SELECT id FROM users WHERE tg_user_id = $1',
    [tgUserId],
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Публичный (pool-level) резолвер внутреннего users.id по tg_user_id.
 * Используется auth-границей api.ts для моста сессионного клиента (issue #258).
 */
export async function internalUserIdByTg(tgUserId: number): Promise<number | null> {
  await ensureReady();
  const res = await getPool().query<{ id: number }>(
    'SELECT id FROM users WHERE tg_user_id = $1',
    [tgUserId],
  );
  return res.rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// FCM push-токены (issue #265)
// ---------------------------------------------------------------------------

/** Сохранить/обновить push-токен устройства за пользователем (upsert по token). */
export async function upsertPushToken(
  userId: number,
  token: string,
  platform: string,
): Promise<void> {
  await ensureReady();
  await getPool().query(
    `INSERT INTO push_tokens(user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (token)
     DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
                   updated_at = CURRENT_TIMESTAMP`,
    [userId, token, platform],
  );
}

/** Все push-токены пользователя. */
export async function getUserPushTokens(userId: number): Promise<string[]> {
  await ensureReady();
  const res = await getPool().query<{ token: string }>(
    'SELECT token FROM push_tokens WHERE user_id = $1',
    [userId],
  );
  return res.rows.map((r) => r.token);
}

/** Удалить невалидные/протухшие токены (по ответу FCM). */
export async function deletePushTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await ensureReady();
  await getPool().query('DELETE FROM push_tokens WHERE token = ANY($1)', [tokens]);
}

/**
 * Пересчитать денормализованные счётчики поездок пользователя из источников.
 * Recompute-on-write (без дрейфа): trips_driver_count — число неотменённых
 * поездок, где он водитель; trips_passenger_count — число активных броней.
 * Вызывается ВНУТРИ транзакции после мутаций (публикация / бронь / отмены).
 * rating_avg/rating_count поддерживаются отдельно в createRating.
 */
async function recomputeUserTripCounters(
  client: PoolClient,
  userId: number,
): Promise<void> {
  await client.query(
    `UPDATE users u SET
       trips_driver_count = (
         SELECT COUNT(*) FROM trips t
         WHERE t.driver_id = u.id AND t.status <> 'cancelled'
       ),
       trips_passenger_count = (
         SELECT COUNT(*) FROM bookings b
         WHERE b.passenger_id = u.id AND b.status = 'active'
       )
     WHERE u.id = $1`,
    [userId],
  );
}

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

export interface RouteAlertParams {
  tgPassengerId: number;
  fromPointId: number;
  toPointId: number;
  desiredDate: string;
  desiredTime?: string | null;
}

export interface RouteAlertResult {
  alertId: number;
  passengerId: number;
  fromPointId: number;
  toPointId: number;
  desiredDate: string;
  desiredTime: string | null;
  status: string;
}

/**
 * Подписка route_alerts на коридор/дату (пустой поиск → «позовём, когда появится»).
 * Пассажир резолвится по telegram-id (должен существовать — создаётся JIT в API
 * до вызова). Точки маршрута проверяются на существование (FK + явная проверка).
 * Бросает Error при отсутствии профиля/точек.
 */
export async function createRouteAlert(
  params: RouteAlertParams,
): Promise<RouteAlertResult> {
  const passengerId = await internalUserIdByTg(params.tgPassengerId);
  if (passengerId === null) {
    throw new Error('Профиль пассажира не найден.');
  }
  return createRouteAlertById(passengerId, params);
}

/** Заявка на маршрут по внутреннему users.id пассажира (мост сессии, issue #258). */
export async function createRouteAlertById(
  passengerId: number,
  params: Omit<RouteAlertParams, 'tgPassengerId'>,
): Promise<RouteAlertResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<RouteAlertResult> => {
    const pointsRes = await client.query<{ id: number }>(
      'SELECT id FROM route_points WHERE id = ANY($1::int[])',
      [[params.fromPointId, params.toPointId]],
    );
    const foundIds = new Set(pointsRes.rows.map((r) => r.id));
    if (!foundIds.has(params.fromPointId) || !foundIds.has(params.toPointId)) {
      throw new Error('Точка маршрута не найдена.');
    }

    const ins = await client.query<{
      id: number;
      desired_time: string | null;
      status: string;
    }>(
      `INSERT INTO route_alerts(passenger_id, from_point_id, to_point_id,
                                desired_date, desired_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, desired_time, status`,
      [
        passengerId,
        params.fromPointId,
        params.toPointId,
        params.desiredDate,
        params.desiredTime ?? null,
      ],
    );
    const row = ins.rows[0];
    return {
      alertId: row.id,
      passengerId,
      fromPointId: params.fromPointId,
      toPointId: params.toPointId,
      desiredDate: params.desiredDate,
      desiredTime: row.desired_time,
      status: row.status,
    };
  });
}

export interface TripTemplate {
  id: number;
  driver_id: number;
  start_point_id: number;
  end_point_id: number;
  time_slot: TimeSlot;
  price_rub: number;
  seats_total: number;
  comment: string | null;
  car_color: string | null;
  plate: string | null;
}

/** Шаблоны поездок водителя (по telegram-id). Пусто, если профиля/шаблонов нет. */
export async function listTripTemplates(
  tgDriverId: number,
): Promise<TripTemplate[]> {
  await ensureReady();
  const res = await getPool().query<TripTemplate>(
    `SELECT tt.id, tt.driver_id, tt.start_point_id, tt.end_point_id,
            tt.time_slot, tt.price_rub, tt.seats_total, tt.comment,
            tt.car_color, tt.plate
     FROM trip_templates tt
     JOIN users u ON u.id = tt.driver_id
     WHERE u.tg_user_id = $1
     ORDER BY tt.id ASC`,
    [tgDriverId],
  );
  return res.rows;
}

export interface PublishTripParams {
  tgDriverId: number;
  templateId: number;
  tripDate: string;
  departureTime: string;
  reverse?: boolean;
  /** Выбранная машина водителя; её модель/цвет/номер пишутся в поездку. */
  carId?: number;
}

export interface PublishTripResult {
  tripId: number;
  driverId: number;
  tripDate: string;
  departureTime: string;
  timeSlot: TimeSlot;
  seatsTotal: number;
  priceRub: number;
}

/**
 * Опубликовать поездку из шаблона водителя (по telegram-id) на дату/время.
 * Шаблон должен принадлежать водителю. Бросает Error при отсутствии профиля/шаблона.
 */
export async function createTripFromTemplate(
  params: PublishTripParams,
): Promise<PublishTripResult> {
  const driverId = await internalUserIdByTg(params.tgDriverId);
  if (driverId === null) {
    throw new Error('Профиль водителя не найден.');
  }
  return createTripFromTemplateById(driverId, params);
}

/** Публикация поездки по внутреннему users.id водителя (мост сессии, issue #258). */
export async function createTripFromTemplateById(
  driverId: number,
  params: Omit<PublishTripParams, 'tgDriverId'>,
): Promise<PublishTripResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<PublishTripResult> => {
    const tplRes = await client.query<TripTemplate>(
      `SELECT id, driver_id, start_point_id, end_point_id, time_slot,
              price_rub, seats_total, comment, car_color, plate
       FROM trip_templates WHERE id = $1 AND driver_id = $2`,
      [params.templateId, driverId],
    );
    const tpl = tplRes.rows[0];
    if (!tpl) {
      throw new Error('Шаблон поездки не найден.');
    }

    // Если reverse=true, меняем местами точки старта/финиша
    const startPointId = params.reverse ? tpl.end_point_id : tpl.start_point_id;
    const endPointId = params.reverse ? tpl.start_point_id : tpl.end_point_id;

    // Вычислить time_slot из departureTime (час < 12 → morning, иначе evening)
    const departureHour = Number.parseInt(params.departureTime.split(':')[0], 10);
    const timeSlot: TimeSlot = departureHour < 12 ? 'morning' : 'evening';

    // Машина поездки: из выбранной (carId) — иначе данные машины из шаблона.
    let carModel: string | null = null;
    let carColor: string | null = tpl.car_color;
    let carPlate: string | null = tpl.plate;
    if (params.carId !== undefined) {
      const carRes = await client.query<{
        model: string;
        color: string | null;
        plate: string | null;
      }>(
        'SELECT model, color, plate FROM cars WHERE id = $1 AND driver_id = $2',
        [params.carId, driverId],
      );
      const car = carRes.rows[0];
      if (!car) {
        throw new Error('Машина не найдена.');
      }
      carModel = car.model;
      carColor = car.color;
      carPlate = car.plate;
    }

    const ins = await client.query<{ id: number }>(
      `INSERT INTO trips(driver_id, start_point_id, end_point_id, trip_date,
                         departure_time, time_slot, price_rub, seats_total,
                         comment, car_model, car_color, plate, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'open')
       RETURNING id`,
      [
        driverId,
        startPointId,
        endPointId,
        params.tripDate,
        params.departureTime,
        timeSlot,
        tpl.price_rub,
        tpl.seats_total,
        tpl.comment,
        carModel,
        carColor,
        carPlate,
      ],
    );

    // Денормализованный счётчик водителя — пересчёт из источника.
    await recomputeUserTripCounters(client, driverId);

    return {
      tripId: ins.rows[0].id,
      driverId,
      tripDate: params.tripDate,
      departureTime: params.departureTime,
      timeSlot,
      seatsTotal: tpl.seats_total,
      priceRub: tpl.price_rub,
    };
  });
}

export interface Car {
  id: number;
  model: string;
  color: string | null;
  plate: string | null;
}

/** Машины водителя (по telegram-id), новые сверху. Пусто, если профиля/машин нет. */
export async function listCarsByDriver(tgDriverId: number): Promise<Car[]> {
  const id = await internalUserIdByTg(tgDriverId);
  return id === null ? [] : listCarsByDriverId(id);
}

/** Авто водителя по внутреннему users.id (мост сессии, issue #258). */
export async function listCarsByDriverId(driverId: number): Promise<Car[]> {
  await ensureReady();
  const res = await getPool().query<Car>(
    `SELECT c.id, c.model, c.color, c.plate
     FROM cars c
     WHERE c.driver_id = $1
     ORDER BY c.id DESC`,
    [driverId],
  );
  return res.rows;
}

export interface CreateCarParams {
  tgDriverId: number;
  model: string;
  color?: string | null;
  plate?: string | null;
}

/** Добавить машину водителю (по telegram-id). Профиль создаётся JIT в API до вызова. */
export async function createCar(params: CreateCarParams): Promise<Car> {
  const driverId = await internalUserIdByTg(params.tgDriverId);
  if (driverId === null) {
    throw new Error('Профиль водителя не найден.');
  }
  return createCarById(driverId, params);
}

/** Добавить машину по внутреннему users.id водителя (мост сессии, issue #258). */
export async function createCarById(
  driverId: number,
  params: { model: string; color?: string | null; plate?: string | null },
): Promise<Car> {
  await ensureReady();
  return withTransaction(async (client): Promise<Car> => {
    const ins = await client.query<Car>(
      `INSERT INTO cars(driver_id, model, color, plate)
       VALUES ($1, $2, $3, $4)
       RETURNING id, model, color, plate`,
      [
        driverId,
        params.model.trim(),
        params.color?.trim() || null,
        params.plate?.trim() || null,
      ],
    );
    return ins.rows[0];
  });
}

/**
 * Создать бронь места на поездке для пассажира (по telegram-id).
 *
 * Атомарно в транзакции (BEGIN/COMMIT): проверка доступности → UPDATE seats_booked
 * с условием seats_booked + seats <= seats_total и status='open' (защита от двойной
 * брони последнего места и перебронирования) → INSERT/реактивация booking.
 * Бросает Error с понятным текстом при недоступности.
 */
export async function createBooking(
  tgPassengerId: number,
  tripId: number,
  seats = 1,
): Promise<BookingResult> {
  const passengerId = await internalUserIdByTg(tgPassengerId);
  if (passengerId === null) {
    throw new Error('Профиль пассажира не найден.');
  }
  return createBookingById(passengerId, tripId, seats);
}

/** Бронь по внутреннему users.id пассажира (мост сессии, issue #258). */
export async function createBookingById(
  passengerId: number,
  tripId: number,
  seats = 1,
): Promise<BookingResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<BookingResult> => {
    const tripRes = await client.query<{
      id: number;
      status: string;
      seats_total: number;
      seats_booked: number;
      driver_id: number;
      driver_tg_user_id: number;
    }>(
      `SELECT t.id, t.status, t.seats_total, t.seats_booked, t.driver_id,
              d.tg_user_id AS driver_tg_user_id
       FROM trips t JOIN users d ON d.id = t.driver_id
       WHERE t.id = $1`,
      [tripId],
    );
    const trip = tripRes.rows[0];

    if (!trip) {
      throw new Error('Поездка не найдена.');
    }
    if (trip.status !== 'open') {
      throw new Error('Поездка недоступна.');
    }
    if (trip.driver_id === passengerId) {
      throw new Error('Нельзя бронировать свою поездку.');
    }

    const existingRes = await client.query<{ id: number; status: string }>(
      'SELECT id, status FROM bookings WHERE trip_id = $1 AND passenger_id = $2',
      [tripId, passengerId],
    );
    const existing = existingRes.rows[0];
    if (existing && existing.status === 'active') {
      throw new Error('Вы уже забронировали эту поездку.');
    }

    // Захватить места: условие в WHERE гарантирует, что не уйдём в минус.
    // RETURNING подтверждает успешный захват (rowCount === 1).
    const upd = await client.query(
      `UPDATE trips SET seats_booked = seats_booked + $1
       WHERE id = $2 AND status = 'open' AND seats_booked + $1 <= seats_total
       RETURNING id`,
      [seats, tripId],
    );
    if (upd.rowCount !== 1) {
      throw new Error('Свободных мест нет.');
    }

    let bookingId: number;
    if (existing) {
      await client.query(
        `UPDATE bookings
         SET status = 'active', seats = $1, cancel_reason = NULL, cancelled_at = NULL,
             created_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [seats, existing.id],
      );
      bookingId = existing.id;
    } else {
      const ins = await client.query<{ id: number }>(
        'INSERT INTO bookings(trip_id, passenger_id, seats) VALUES ($1, $2, $3) RETURNING id',
        [tripId, passengerId, seats],
      );
      bookingId = ins.rows[0].id;
    }

    // Денормализованный счётчик пассажира — пересчёт из источника.
    await recomputeUserTripCounters(client, passengerId);

    const afterRes = await client.query<{ avail: number }>(
      'SELECT seats_total - seats_booked AS avail FROM trips WHERE id = $1',
      [tripId],
    );

    return { bookingId, tripId, seatsAvailable: afterRes.rows[0].avail };
  });
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

/**
 * Последняя заявка ВУ водителя (для статусного экрана «Заявка водителя»).
 * Возвращает серию/номер и срок действия из license_requests; null — заявок нет.
 */
export async function getLatestLicenseRequest(
  driverId: number,
): Promise<{ series_number: string; valid_until: string } | null> {
  await ensureReady();
  const res = await getPool().query<{ series_number: string; valid_until: string }>(
    `SELECT series_number, valid_until
     FROM license_requests
     WHERE driver_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [driverId],
  );
  return res.rows[0] ?? null;
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

export interface UserReview {
  author_id: number;
  author_name: string;
  stars: number;
  comment: string | null;
  tags: string | null;
  created_at: string;
}

/**
 * Список отзывов о пользователе (для GET /api/users/:id/reviews).
 * Возвращает отзывы, отсортированные по дате (новые — первыми).
 */
export async function listUserReviews(userId: number): Promise<UserReview[]> {
  await ensureReady();
  const res = await getPool().query<UserReview>(
    `SELECT r.rater_id AS author_id, u.name AS author_name, r.stars, r.comment, r.tags, r.created_at
     FROM ratings r
     JOIN users u ON u.id = r.rater_id
     WHERE r.ratee_id = $1
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return res.rows;
}

export interface UserTripItem {
  trip_id: number;
  role: 'driver' | 'passenger';
  trip_date: string;
  departure_time: string;
  time_slot: TimeSlot;
  start_title: string;
  end_title: string;
  price_rub: number;
  seats_total: number;
  seats_booked: number;
  trip_status: string;
  booking_id: number | null;
  booking_status: string | null;
  passenger_seats: number | null;
}

export type TripStatusFilter = 'upcoming' | 'past';

/**
 * Список поездок пользователя (как водителя + как пассажира) для GET /api/me/trips.
 * status='upcoming' — поездки с trip_date >= сегодня, status='open'/'active'.
 * status='past' — trip_date < сегодня ИЛИ завершённые (cancelled/completed).
 */
export async function getUserTrips(
  tgUserId: number,
  statusFilter: TripStatusFilter,
): Promise<UserTripItem[]> {
  const internalId = await internalUserIdByTg(tgUserId);
  return internalId === null ? [] : getUserTripsById(internalId, statusFilter);
}

/** Поездки пользователя по внутреннему users.id (мост сессии, issue #258). */
export async function getUserTripsById(
  internalId: number,
  statusFilter: TripStatusFilter,
): Promise<UserTripItem[]> {
  await ensureReady();

  const today = todayISO();

  // Поездки где пользователь — водитель
  const driverQuery =
    statusFilter === 'upcoming'
      ? `SELECT t.id AS trip_id, 'driver' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                NULL::INTEGER AS booking_id, NULL::TEXT AS booking_status,
                NULL::INTEGER AS passenger_seats, NULL::INTEGER AS driver_id
         FROM trips t
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE t.driver_id = $1 AND t.trip_date >= $2 AND t.status = 'open'`
      : `SELECT t.id AS trip_id, 'driver' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                NULL::INTEGER AS booking_id, NULL::TEXT AS booking_status,
                NULL::INTEGER AS passenger_seats, NULL::INTEGER AS driver_id
         FROM trips t
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE t.driver_id = $1 AND (t.trip_date < $2 OR t.status IN ('cancelled', 'completed'))`;

  // Поездки где пользователь — пассажир
  const passengerQuery =
    statusFilter === 'upcoming'
      ? `SELECT t.id AS trip_id, 'passenger' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                b.id AS booking_id, b.status AS booking_status, b.seats AS passenger_seats,
                t.driver_id
         FROM bookings b
         JOIN trips t ON t.id = b.trip_id
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE b.passenger_id = $1 AND b.status = 'active' AND t.trip_date >= $2 AND t.status = 'open'`
      : `SELECT t.id AS trip_id, 'passenger' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                b.id AS booking_id, b.status AS booking_status, b.seats AS passenger_seats,
                t.driver_id
         FROM bookings b
         JOIN trips t ON t.id = b.trip_id
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE b.passenger_id = $1 AND (t.trip_date < $2 OR b.status IN ('cancelled_by_passenger', 'cancelled_by_driver') OR t.status IN ('cancelled', 'completed'))`;

  const unionQuery = `
    (${driverQuery})
    UNION ALL
    (${passengerQuery})
    ORDER BY trip_date DESC, departure_time DESC
  `;

  const res = await getPool().query<UserTripItem>(unionQuery, [internalId, today]);
  return res.rows;
}

export interface CreateRatingParams {
  tgRaterId: number;
  tripId: number;
  rateeId: number;
  stars: number;
  tags?: string | null;
  comment?: string | null;
}

export interface CreateRatingResult {
  ratingId: number;
  tripId: number;
  rateeId: number;
  stars: number;
  rateeNewAvg: number;
  rateeNewCount: number;
}

/**
 * Создать рейтинг после поездки. Оценивающий (rater) — по telegram-id, оцениваемый (ratee)
 * — по внутреннему id. После вставки рейтинга пересчитывается users.rating_avg/rating_count
 * у оцениваемого. UNIQUE(trip_id, rater_id, ratee_id) защищает от дублей.
 * Бросает Error при дублях, несуществующих пользователях/поездках, нарушении диапазона stars.
 */
export async function createRating(
  params: CreateRatingParams,
): Promise<CreateRatingResult> {
  const raterId = await internalUserIdByTg(params.tgRaterId);
  if (raterId === null) {
    throw new Error('Профиль оценивающего не найден.');
  }
  return createRatingById(raterId, params);
}

/** Рейтинг по внутреннему users.id оценивающего (мост сессии, issue #258). */
export async function createRatingById(
  raterId: number,
  params: Omit<CreateRatingParams, 'tgRaterId'>,
): Promise<CreateRatingResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CreateRatingResult> => {
    if (params.stars < 1 || params.stars > 5) {
      throw new Error('Оценка должна быть от 1 до 5 звёзд.');
    }

    // Проверить существование trip и ratee
    const tripCheck = await client.query<{ id: number }>(
      'SELECT id FROM trips WHERE id = $1',
      [params.tripId],
    );
    if (tripCheck.rows.length === 0) {
      throw new Error('Поездка не найдена.');
    }

    const rateeCheck = await client.query<{ id: number }>(
      'SELECT id FROM users WHERE id = $1',
      [params.rateeId],
    );
    if (rateeCheck.rows.length === 0) {
      throw new Error('Оцениваемый пользователь не найден.');
    }

    // Вставить рейтинг
    const ins = await client.query<{ id: number }>(
      `INSERT INTO ratings(trip_id, rater_id, ratee_id, stars, tags, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [params.tripId, raterId, params.rateeId, params.stars, params.tags ?? null, params.comment ?? null],
    );

    // Пересчитать агрегаты у ratee
    const aggRes = await client.query<{ avg: number; cnt: number }>(
      `SELECT COALESCE(AVG(stars), 0.0) AS avg, COUNT(*) AS cnt
       FROM ratings WHERE ratee_id = $1`,
      [params.rateeId],
    );
    const newAvg = Number(aggRes.rows[0].avg);
    const newCount = Number(aggRes.rows[0].cnt);

    await client.query(
      'UPDATE users SET rating_avg = $1, rating_count = $2 WHERE id = $3',
      [newAvg, newCount, params.rateeId],
    );

    return {
      ratingId: ins.rows[0].id,
      tripId: params.tripId,
      rateeId: params.rateeId,
      stars: params.stars,
      rateeNewAvg: newAvg,
      rateeNewCount: newCount,
    };
  });
}

export interface BookingDetail {
  booking_id: number;
  passenger_id: number;
  passenger_name: string;
  passenger_username: string | null;
  seats: number;
  status: string;
  created_at: string;
  /** Телефон пассажира — отдаётся ТОЛЬКО водителю поездки и ТОЛЬКО для активной брони, иначе NULL. */
  passenger_phone: string | null;
}

/** Результат запроса броней поездки: либо список, либо причина отказа (нет поездки / не владелец). */
export type TripBookingsResult =
  | { ok: true; bookings: BookingDetail[] }
  | { ok: false; reason: 'not_found' | 'forbidden' };

/**
 * Список броней для поездки (для водителя, GET /api/trips/:id/bookings).
 * СКОУП НА ВЛАДЕЛЬЦА: брони отдаются только водителю поездки (requesterUserId);
 * любому другому — { ok:false, reason:'forbidden' } (закрывает IDOR на чтение броней).
 * passenger_phone раскрывается только для активных броней.
 */
export async function getTripBookings(
  tripId: number,
  requesterUserId: number,
): Promise<TripBookingsResult> {
  await ensureReady();
  // Владение поездкой: проверяем, что запрашивающий — её водитель.
  const ownerRes = await getPool().query<{ driver_id: number }>(
    'SELECT driver_id FROM trips WHERE id = $1',
    [tripId],
  );
  const owner = ownerRes.rows[0];
  if (!owner) {
    return { ok: false, reason: 'not_found' };
  }
  if (owner.driver_id !== requesterUserId) {
    return { ok: false, reason: 'forbidden' };
  }

  const res = await getPool().query<BookingDetail>(
    `SELECT b.id AS booking_id, b.passenger_id, u.name AS passenger_name,
            u.username AS passenger_username, b.seats, b.status, b.created_at,
            CASE WHEN b.status = 'active' THEN u.phone ELSE NULL END AS passenger_phone
     FROM bookings b
     JOIN users u ON u.id = b.passenger_id
     WHERE b.trip_id = $1
     ORDER BY b.created_at ASC`,
    [tripId],
  );
  return { ok: true, bookings: res.rows };
}

export interface CancelBookingResult {
  bookingId: number;
  tripId: number;
  seatsFreed: number;
  newAvailable: number;
}

/** Данные брони + пассажира + поездки для построения уведомлений (подтверждение/отмена). */
export interface BookingActionResult {
  bookingId: number;
  tripId: number;
  passengerId: number;
  passengerTgUserId: number;
  passengerName: string;
  seats: number;
  startTitle: string;
  endTitle: string;
  tripDate: string;
  departureTime: string;
}

/** Результат отмены брони водителем: освобождённые места + данные для уведомления пассажиру. */
export type CancelBookingActionResult = BookingActionResult & {
  seatsFreed: number;
  newAvailable: number;
};

/** Пассажир активной брони отменяемой поездки (для уведомлений). */
export interface AffectedPassenger {
  passengerId: number;
  passengerTgUserId: number;
  seats: number;
}

/** Результат отмены всей поездки водителем: данные поездки + затронутые пассажиры. */
export interface CancelTripResult {
  tripId: number;
  startTitle: string;
  endTitle: string;
  tripDate: string;
  departureTime: string;
  passengers: AffectedPassenger[];
}

/**
 * Отменить бронь водителем (PATCH /api/bookings/:id action='cancel_by_driver').
 * Переводит бронь в status='cancelled_by_driver', освобождает seats в trips.seats_booked.
 * Бросает Error если бронь не найдена или уже отменена.
 */
export async function cancelBookingByDriver(
  bookingId: number,
  tgDriverId: number,
): Promise<CancelBookingActionResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CancelBookingActionResult> => {
    const driverId = await getInternalUserId(client, tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    const bookingRes = await client.query<{
      id: number;
      trip_id: number;
      status: string;
      seats: number;
      driver_id: number;
      passenger_id: number;
      passenger_tg_user_id: string;
      passenger_name: string;
      start_title: string;
      end_title: string;
      trip_date: string;
      departure_time: string;
    }>(
      `SELECT b.id, b.trip_id, b.status, b.seats, t.driver_id,
              b.passenger_id, u.tg_user_id AS passenger_tg_user_id, u.name AS passenger_name,
              sp.title AS start_title, ep.title AS end_title,
              t.trip_date, t.departure_time
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN users u ON u.id = b.passenger_id
       JOIN route_points sp ON sp.id = t.start_point_id
       JOIN route_points ep ON ep.id = t.end_point_id
       WHERE b.id = $1`,
      [bookingId],
    );
    const booking = bookingRes.rows[0];

    if (!booking) {
      throw new Error('Бронь не найдена.');
    }
    if (booking.driver_id !== driverId) {
      throw new Error('Вы не водитель этой поездки.');
    }
    if (booking.status !== 'active') {
      throw new Error('Бронь уже отменена или недоступна.');
    }

    // Отменить бронь
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled_by_driver', cancelled_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [bookingId],
    );

    // Освободить места
    await client.query(
      'UPDATE trips SET seats_booked = seats_booked - $1 WHERE id = $2',
      [booking.seats, booking.trip_id],
    );

    // Бронь снята — пересчитать счётчик пассажира.
    await recomputeUserTripCounters(client, booking.passenger_id);

    const availRes = await client.query<{ avail: number }>(
      'SELECT seats_total - seats_booked AS avail FROM trips WHERE id = $1',
      [booking.trip_id],
    );

    return {
      bookingId,
      tripId: booking.trip_id,
      passengerId: booking.passenger_id,
      passengerTgUserId: Number(booking.passenger_tg_user_id),
      passengerName: booking.passenger_name,
      seats: booking.seats,
      startTitle: booking.start_title,
      endTitle: booking.end_title,
      tripDate: booking.trip_date,
      departureTime: booking.departure_time,
      seatsFreed: booking.seats,
      newAvailable: availRes.rows[0].avail,
    };
  });
}

/**
 * Отменить всю поездку водителем (POST /api/trips/:id/cancel).
 * Переводит trips.status='cancelled', отменяет все активные брони (cancelled_by_driver).
 * Возвращает данные поездки и список затронутых пассажиров для уведомлений.
 * Бросает Error при отсутствии поездки/прав/неоткрытом статусе.
 */
export async function cancelTripByDriver(
  tripId: number,
  tgDriverId: number,
): Promise<CancelTripResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CancelTripResult> => {
    const driverId = await getInternalUserId(client, tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    const tripRes = await client.query<{
      id: number;
      driver_id: number;
      status: string;
      start_title: string;
      end_title: string;
      trip_date: string;
      departure_time: string;
    }>(
      `SELECT t.id, t.driver_id, t.status,
              sp.title AS start_title, ep.title AS end_title,
              t.trip_date, t.departure_time
       FROM trips t
       JOIN route_points sp ON sp.id = t.start_point_id
       JOIN route_points ep ON ep.id = t.end_point_id
       WHERE t.id = $1`,
      [tripId],
    );
    const trip = tripRes.rows[0];

    if (!trip) {
      throw new Error('Поездка не найдена.');
    }
    if (trip.driver_id !== driverId) {
      throw new Error('Вы не водитель этой поездки.');
    }
    if (trip.status !== 'open') {
      throw new Error('Поездка уже отменена или завершена.');
    }

    // Список активных пассажиров (для уведомлений) — собираем до отмены броней
    const passengersRes = await client.query<{
      passenger_id: number;
      passenger_tg_user_id: string;
      seats: number;
    }>(
      `SELECT b.passenger_id, u.tg_user_id AS passenger_tg_user_id, b.seats
       FROM bookings b
       JOIN users u ON u.id = b.passenger_id
       WHERE b.trip_id = $1 AND b.status = 'active'`,
      [tripId],
    );

    await client.query(`UPDATE trips SET status = 'cancelled' WHERE id = $1`, [tripId]);
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled_by_driver', cancelled_at = CURRENT_TIMESTAMP
       WHERE trip_id = $1 AND status = 'active'`,
      [tripId],
    );

    // Поездка отменена — пересчитать счётчик водителя и всех затронутых пассажиров.
    await recomputeUserTripCounters(client, driverId);
    for (const p of passengersRes.rows) {
      await recomputeUserTripCounters(client, p.passenger_id);
    }

    return {
      tripId,
      startTitle: trip.start_title,
      endTitle: trip.end_title,
      tripDate: trip.trip_date,
      departureTime: trip.departure_time,
      passengers: passengersRes.rows.map((r) => ({
        passengerId: r.passenger_id,
        passengerTgUserId: Number(r.passenger_tg_user_id),
        seats: r.seats,
      })),
    };
  });
}

/**
 * Подтвердить бронь водителем (callback-кнопка в Telegram).
 * Переводит бронь в status='confirmed' (добавим новый статус или оставим 'active'?
 * В схеме нет 'confirmed', поэтому просто проверяем, что бронь активна).
 * В текущей схеме bookings.status: 'active' | 'cancelled_by_passenger' | 'cancelled_by_driver'.
 * Для подтверждения можно оставить 'active' (уже подтверждено созданием).
 * Эта функция просто проверяет, что бронь принадлежит поездке водителя и активна.
 * Возвращает подтверждение без изменения status.
 *
 * @param bookingId ID брони
 * @param tgDriverId Telegram ID водителя
 * @returns Детали брони (пассажир, места, статус)
 */
export async function confirmBookingByDriver(
  bookingId: number,
  tgDriverId: number,
): Promise<BookingActionResult> {
  await ensureReady();

  return withTransaction(async (client) => {
    const driverId = await getInternalUserId(client, tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    const bookingRes = await client.query<{
      id: number;
      trip_id: number;
      status: string;
      seats: number;
      driver_id: number;
      passenger_id: number;
      passenger_tg_user_id: string;
      passenger_name: string;
      start_title: string;
      end_title: string;
      trip_date: string;
      departure_time: string;
    }>(
      `SELECT b.id, b.trip_id, b.status, b.seats, t.driver_id,
              b.passenger_id, u.tg_user_id AS passenger_tg_user_id, u.name AS passenger_name,
              sp.title AS start_title, ep.title AS end_title,
              t.trip_date, t.departure_time
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN users u ON u.id = b.passenger_id
       JOIN route_points sp ON sp.id = t.start_point_id
       JOIN route_points ep ON ep.id = t.end_point_id
       WHERE b.id = $1`,
      [bookingId],
    );
    const booking = bookingRes.rows[0];

    if (!booking) {
      throw new Error('Бронь не найдена.');
    }
    if (booking.driver_id !== driverId) {
      throw new Error('Вы не водитель этой поездки.');
    }
    if (booking.status !== 'active') {
      throw new Error('Бронь уже отменена или недоступна.');
    }

    // В текущей схеме нет статуса 'confirmed', поэтому просто возвращаем подтверждение
    // (бронь уже активна с момента создания). Данные нужны для уведомления пассажиру.
    return {
      bookingId: booking.id,
      tripId: booking.trip_id,
      passengerId: booking.passenger_id,
      passengerTgUserId: Number(booking.passenger_tg_user_id),
      passengerName: booking.passenger_name,
      seats: booking.seats,
      startTitle: booking.start_title,
      endTitle: booking.end_title,
      tripDate: booking.trip_date,
      departureTime: booking.departure_time,
    };
  });
}

export interface UpdateAlertStatusResult {
  alertId: number;
  status: string;
}

/**
 * Обновить статус route_alert (для отмены через callback-кнопку в Telegram).
 *
 * @param alertId ID алерта
 * @param newStatus Новый статус ('cancelled', 'active', 'notified')
 * @param tgPassengerId Telegram ID пассажира (владелец алерта)
 * @returns Обновлённый статус
 */
export async function updateAlertStatus(
  alertId: number,
  newStatus: 'active' | 'notified' | 'cancelled',
  tgPassengerId: number,
): Promise<UpdateAlertStatusResult> {
  await ensureReady();

  return withTransaction(async (client) => {
    const passengerId = await getInternalUserId(client, tgPassengerId);
    if (passengerId === null) {
      throw new Error('Профиль пассажира не найден.');
    }

    const alertRes = await client.query<{
      id: number;
      passenger_id: number;
      status: string;
    }>(
      'SELECT id, passenger_id, status FROM route_alerts WHERE id = $1',
      [alertId],
    );
    const alert = alertRes.rows[0];

    if (!alert) {
      throw new Error('Заявка не найдена.');
    }
    if (alert.passenger_id !== passengerId) {
      throw new Error('Вы не владелец этой заявки.');
    }

    const upd = await client.query<{ id: number; status: string }>(
      'UPDATE route_alerts SET status = $1 WHERE id = $2 RETURNING id, status',
      [newStatus, alertId],
    );

    return {
      alertId: upd.rows[0].id,
      status: upd.rows[0].status,
    };
  });
}

/**
 * Диагностика наполнения БД (для проверки demo-seed в dev/проде).
 * Возвращает счётчики: route_points, users, trips, trips_today, demo_drivers (без ПДн).
 */
export async function getDebugCounts(): Promise<{
  route_points: number;
  users: number;
  trips: number;
  trips_today: number;
  demo_drivers: number;
}> {
  await ensureReady();
  const pool = getPool();
  const today = todayISO();

  // Демо-водители: tg_user_id в диапазоне 900000001–900000003 (из seed.ts SEED_DRIVERS)
  const demoTgIds = [900000001, 900000002, 900000003];

  const [routeRes, usersRes, tripsRes, tripsTodayRes, demoDriversRes] = await Promise.all([
    pool.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM route_points'),
    pool.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM users'),
    pool.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM trips'),
    pool.query<{ cnt: string }>(
      'SELECT COUNT(*) AS cnt FROM trips WHERE trip_date = $1',
      [today],
    ),
    pool.query<{ cnt: string }>(
      'SELECT COUNT(*) AS cnt FROM users WHERE tg_user_id = ANY($1::bigint[])',
      [demoTgIds],
    ),
  ]);

  return {
    route_points: Number(routeRes.rows[0].cnt),
    users: Number(usersRes.rows[0].cnt),
    trips: Number(tripsRes.rows[0].cnt),
    trips_today: Number(tripsTodayRes.rows[0].cnt),
    demo_drivers: Number(demoDriversRes.rows[0].cnt),
  };
}

/**
 * Получить или создать trip_template водителя для коридора Брагино↔Центр.
 * Идемпотентно: если шаблон уже есть — вернуть существующий, иначе создать дефолтный
 * (morning, price_rub=120, seats_total=3). Бросает Error если профиль водителя
 * не найден или точки коридора отсутствуют.
 */
export async function getOrCreateDriverTemplate(
  tgDriverId: number,
): Promise<TripTemplate> {
  const driverId = await internalUserIdByTg(tgDriverId);
  if (driverId === null) {
    throw new Error('Профиль водителя не найден.');
  }
  return getOrCreateDriverTemplateById(driverId);
}

/** Шаблон поездки по внутреннему users.id (мост сессии, issue #258). */
export async function getOrCreateDriverTemplateById(
  driverId: number,
): Promise<TripTemplate> {
  await ensureReady();

  return withTransaction(async (client): Promise<TripTemplate> => {
    // Получить точки коридора Брагино↔Центр
    const pointsRes = await client.query<{ id: number; title: string }>(
      `SELECT id, title FROM route_points
       WHERE (locality = 'Ярославль' AND district = 'Дзержинский район' AND title = 'Брагино')
          OR (locality = 'Ярославль' AND district = 'Кировский район' AND title = 'Центр')`,
    );
    const pointIdByTitle = new Map<string, number>();
    for (const p of pointsRes.rows) {
      pointIdByTitle.set(p.title, p.id);
    }
    const braginoId = pointIdByTitle.get('Брагино');
    const centrId = pointIdByTitle.get('Центр');
    if (braginoId === undefined || centrId === undefined) {
      throw new Error('Точки коридора Брагино↔Центр не найдены.');
    }

    // Проверить существующие шаблоны водителя для коридора
    const existingRes = await client.query<TripTemplate>(
      `SELECT id, driver_id, start_point_id, end_point_id, time_slot, price_rub, seats_total, comment
       FROM trip_templates
       WHERE driver_id = $1
         AND ((start_point_id = $2 AND end_point_id = $3) OR (start_point_id = $3 AND end_point_id = $2))
       ORDER BY id ASC
       LIMIT 1`,
      [driverId, braginoId, centrId],
    );

    if (existingRes.rows.length > 0) {
      return existingRes.rows[0];
    }

    // Создать дефолтный шаблон: Брагино→Центр, morning, 120 руб, 3 места
    const insertRes = await client.query<TripTemplate>(
      `INSERT INTO trip_templates(driver_id, start_point_id, end_point_id, time_slot, price_rub, seats_total, comment)
       VALUES ($1, $2, $3, 'morning', 120, 3, NULL)
       RETURNING id, driver_id, start_point_id, end_point_id, time_slot, price_rub, seats_total, comment`,
      [driverId, braginoId, centrId],
    );

    return insertRes.rows[0];
  });
}

export interface SubmitLicenseParams {
  tgDriverId: number;
  seriesNumber: string;
  validUntil: string;
}

export interface SubmitLicenseResult {
  requestId: number;
  status: string;
}

/**
 * Отправить заявку на проверку ВУ (W1: модерация).
 * Идемпотентно: повторная заявка обновляет существующую pending, не плодит дубли.
 * Создает license_request(pending) + обновляет users.license_status='pending'.
 * Бросает Error если профиль водителя не найден.
 */
export async function submitLicenseRequest(
  params: SubmitLicenseParams,
): Promise<SubmitLicenseResult> {
  const driverId = await internalUserIdByTg(params.tgDriverId);
  if (driverId === null) {
    throw new Error('Профиль водителя не найден.');
  }
  return submitLicenseRequestById(driverId, params.seriesNumber, params.validUntil);
}

/** Заявка на ВУ по внутреннему users.id (мост сессии, issue #258). */
export async function submitLicenseRequestById(
  driverId: number,
  seriesNumber: string,
  validUntil: string,
): Promise<SubmitLicenseResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<SubmitLicenseResult> => {
    // Проверить существующую pending-заявку
    const existingRes = await client.query<{ id: number; status: string }>(
      'SELECT id, status FROM license_requests WHERE driver_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [driverId, 'pending'],
    );

    let requestId: number;

    if (existingRes.rows.length > 0) {
      // Обновить существующую pending-заявку
      const upd = await client.query<{ id: number }>(
        `UPDATE license_requests
         SET series_number = $1, valid_until = $2, created_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id`,
        [seriesNumber, validUntil, existingRes.rows[0].id],
      );
      requestId = upd.rows[0].id;
    } else {
      // Создать новую заявку
      const ins = await client.query<{ id: number }>(
        `INSERT INTO license_requests(driver_id, series_number, valid_until, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [driverId, seriesNumber, validUntil],
      );
      requestId = ins.rows[0].id;
    }

    // Обновить users.license_status='pending'
    await client.query(
      "UPDATE users SET license_status = 'pending' WHERE id = $1",
      [driverId],
    );

    return { requestId, status: 'pending' };
  });
}

export interface PendingLicenseRequest {
  requestId: number;
  driverTgUserId: number;
  driverName: string;
  driverUsername: string | null;
  seriesNumber: string;
  validUntil: string;
  createdAt: string;
}

/**
 * Список всех заявок на проверку ВУ в статусе pending (для админ-очереди в боте).
 * Джойнит данные водителя (имя, username, telegram-id). Сортировка — старые сверху,
 * чтобы админ обрабатывал в порядке поступления. created_at форматируется в SQL,
 * чтобы не зависеть от таймзоны/локали Node.
 */
export async function listPendingLicenseRequests(): Promise<PendingLicenseRequest[]> {
  await ensureReady();
  const res = await getPool().query<{
    request_id: number;
    tg_user_id: number;
    name: string;
    username: string | null;
    series_number: string;
    valid_until: string;
    created_at: string;
  }>(
    `SELECT lr.id AS request_id,
            u.tg_user_id,
            u.name,
            u.username,
            lr.series_number,
            lr.valid_until,
            to_char(lr.created_at, 'DD.MM.YYYY HH24:MI') AS created_at
     FROM license_requests lr
     JOIN users u ON u.id = lr.driver_id
     WHERE lr.status = 'pending'
     ORDER BY lr.created_at ASC`,
  );
  return res.rows.map((r) => ({
    requestId: r.request_id,
    driverTgUserId: r.tg_user_id,
    driverName: r.name,
    driverUsername: r.username,
    seriesNumber: r.series_number,
    validUntil: r.valid_until,
    createdAt: r.created_at,
  }));
}

export interface LicenseDecisionResult {
  driverTgUserId: number;
  driverName: string;
  seriesNumber: string;
}

/**
 * Решение по заявке на проверку ВУ (модерация админом).
 * Транзакционно: проверяет, что заявка существует и pending; выставляет
 * license_requests.status (approved|rejected) + reviewer/reviewed_at и
 * users.license_status (verified|rejected). Возвращает данные водителя для пуша.
 * Бросает Error, если заявка не найдена или уже обработана.
 */
async function decideLicenseRequest(
  requestId: number,
  decision: 'approved' | 'rejected',
  reviewer: string,
): Promise<LicenseDecisionResult> {
  await ensureReady();
  const userStatus = decision === 'approved' ? 'verified' : 'rejected';

  return withTransaction(async (client): Promise<LicenseDecisionResult> => {
    const reqRes = await client.query<{
      driver_id: number;
      series_number: string;
      status: string;
    }>(
      'SELECT driver_id, series_number, status FROM license_requests WHERE id = $1 FOR UPDATE',
      [requestId],
    );
    if (reqRes.rows.length === 0) {
      throw new Error('Заявка на проверку ВУ не найдена.');
    }
    const reqRow = reqRes.rows[0];
    if (reqRow.status !== 'pending') {
      throw new Error('Заявка уже обработана.');
    }

    await client.query(
      `UPDATE license_requests
       SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewer = $2
       WHERE id = $3`,
      [decision, reviewer, requestId],
    );

    const userRes = await client.query<{ tg_user_id: number; name: string }>(
      'UPDATE users SET license_status = $1 WHERE id = $2 RETURNING tg_user_id, name',
      [userStatus, reqRow.driver_id],
    );
    const u = userRes.rows[0];

    return {
      driverTgUserId: u.tg_user_id,
      driverName: u.name,
      seriesNumber: reqRow.series_number,
    };
  });
}

/** Одобрить заявку на проверку ВУ → license_status='verified'. */
export async function approveLicenseRequest(
  requestId: number,
  reviewer: string,
): Promise<LicenseDecisionResult> {
  return decideLicenseRequest(requestId, 'approved', reviewer);
}

/** Отклонить заявку на проверку ВУ → license_status='rejected'. */
export async function rejectLicenseRequest(
  requestId: number,
  reviewer: string,
): Promise<LicenseDecisionResult> {
  return decideLicenseRequest(requestId, 'rejected', reviewer);
}

/**
 * Типы уведомлений.
 */
export type NotificationType =
  | 'booking'
  | 'booking_confirmed'
  | 'cancel'
  | 'rate_reminder'
  | 'trip_new'
  | 'license_approved'
  | 'license_rejected';

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  ref_trip_id: number | null;
  ref_user_id: number | null;
  created_at: string;
}

export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  refTripId?: number | null;
  refUserId?: number | null;
}

/**
 * Создать уведомление для пользователя.
 */
export async function createNotification(params: CreateNotificationParams): Promise<number> {
  await ensureReady();
  const res = await getPool().query<{ id: number }>(
    `INSERT INTO notifications(user_id, type, title, body, ref_trip_id, ref_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      params.userId,
      params.type,
      params.title,
      params.body,
      params.refTripId ?? null,
      params.refUserId ?? null,
    ],
  );
  return res.rows[0].id;
}

/**
 * Получить список уведомлений пользователя (упорядочены по created_at DESC).
 */
export async function listNotifications(tgUserId: number, limit = 50): Promise<NotificationItem[]> {
  await ensureReady();
  const res = await getPool().query<NotificationItem>(
    `SELECT n.id, n.type, n.title, n.body, n.read, n.ref_trip_id, n.ref_user_id, n.created_at
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     WHERE u.tg_user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [tgUserId, limit],
  );
  return res.rows;
}

/**
 * Пометить уведомление как прочитанное. Принадлежность проверяется по tg-id владельца.
 */
export async function markNotificationRead(notificationId: number, tgUserId: number): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    `UPDATE notifications n SET read = TRUE
     FROM users u
     WHERE n.id = $1 AND n.user_id = u.id AND u.tg_user_id = $2`,
    [notificationId, tgUserId],
  );
  return res.rowCount !== null && res.rowCount > 0;
}

/**
 * Лениво создать недостающие напоминания «оставьте отзыв» для пользователя как пассажира.
 *
 * Для каждой завершённой поездки (trip_date в прошлом), где пользователь был активным
 * пассажиром, ещё не оценил водителя и для которой ещё нет напоминания — создаётся
 * уведомление rate_reminder. Идемпотентно (NOT EXISTS по существующему rate_reminder).
 * Вызывается из GET /api/notifications перед выдачей списка (крона нет).
 *
 * @param tgUserId Telegram ID пользователя
 * @param today Сегодняшняя дата YYYY-MM-DD (для сравнения с trip_date)
 */
export async function ensureRateReminders(tgUserId: number, today: string): Promise<void> {
  await ensureReady();
  await getPool().query(
    `INSERT INTO notifications (user_id, type, title, body, ref_trip_id, ref_user_id)
     SELECT b.passenger_id, 'rate_reminder', 'Оцените поездку',
            'Как прошла поездка ' || sp.title || ' → ' || ep.title || '? Оставьте оценку.',
            t.id, t.driver_id
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     JOIN users u ON u.id = b.passenger_id
     JOIN route_points sp ON sp.id = t.start_point_id
     JOIN route_points ep ON ep.id = t.end_point_id
     WHERE u.tg_user_id = $1
       AND b.status = 'active'
       AND t.status <> 'cancelled'
       AND t.trip_date < $2
       AND NOT EXISTS (
         SELECT 1 FROM ratings r WHERE r.trip_id = t.id AND r.rater_id = b.passenger_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = b.passenger_id AND n.type = 'rate_reminder' AND n.ref_trip_id = t.id
       )`,
    [tgUserId, today],
  );
}

// --- internal-id варианты уведомлений (мост сессии, issue #258) ---

export async function listNotificationsById(userId: number, limit = 50): Promise<NotificationItem[]> {
  await ensureReady();
  const res = await getPool().query<NotificationItem>(
    `SELECT n.id, n.type, n.title, n.body, n.read, n.ref_trip_id, n.ref_user_id, n.created_at
     FROM notifications n
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return res.rows;
}

export async function markNotificationReadById(notificationId: number, userId: number): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
    [notificationId, userId],
  );
  return res.rowCount !== null && res.rowCount > 0;
}

export async function ensureRateRemindersById(userId: number, today: string): Promise<void> {
  await ensureReady();
  await getPool().query(
    `INSERT INTO notifications (user_id, type, title, body, ref_trip_id, ref_user_id)
     SELECT b.passenger_id, 'rate_reminder', 'Оцените поездку',
            'Как прошла поездка ' || sp.title || ' → ' || ep.title || '? Оставьте оценку.',
            t.id, t.driver_id
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     JOIN route_points sp ON sp.id = t.start_point_id
     JOIN route_points ep ON ep.id = t.end_point_id
     WHERE b.passenger_id = $1
       AND b.status = 'active'
       AND t.status <> 'cancelled'
       AND t.trip_date < $2
       AND NOT EXISTS (
         SELECT 1 FROM ratings r WHERE r.trip_id = t.id AND r.rater_id = b.passenger_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = b.passenger_id AND n.type = 'rate_reminder' AND n.ref_trip_id = t.id
       )`,
    [userId, today],
  );
}
