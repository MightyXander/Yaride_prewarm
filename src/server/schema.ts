/**
 * Схема БД и линейные миграции по версии (PostgreSQL, node-postgres).
 *
 * Минимальный срез модели данных, перенесённый из основного репозитория
 * MightyXander/Yaride (app/db_postgres.py) под MVP «Один туннель».
 *
 * Таблицы: users, route_points, trips, bookings, trip_templates, route_alerts
 * + служебная schema_version. Postgres-диалект: SERIAL/BIGINT PK, TIMESTAMPTZ,
 * REFERENCES, плейсхолдеры $1..$n, DOUBLE PRECISION для координат/рейтингов.
 * Инициализация идемпотентна (CREATE TABLE/INDEX IF NOT EXISTS).
 */

import type { Pool } from 'pg';

/** Текущая версия схемы кода prewarm-слоя данных. */
export const CURRENT_SCHEMA_VERSION = 8;

/** Полный bootstrap схемы для свежей БД (идемпотентно). */
const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    -- tg_user_id NULLABLE: браузерные аккаунты (email/пароль) Telegram-id не имеют.
    tg_user_id BIGINT UNIQUE,
    name TEXT NOT NULL,
    username TEXT,
    age INTEGER,
    phone TEXT,
    rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    trips_driver_count INTEGER NOT NULL DEFAULT 0,
    trips_passenger_count INTEGER NOT NULL DEFAULT 0,
    license_status TEXT NOT NULL DEFAULT 'none'
      CHECK (license_status IN ('none', 'pending', 'verified', 'rejected')),
    -- Браузерная авторизация (issue #242): email/пароль + согласия 152-ФЗ.
    email TEXT,
    password_hash TEXT,
    first_name TEXT,
    last_name TEXT,
    pdn_consent_at TIMESTAMPTZ,
    pdn_consent_version TEXT,
    marketing_consent_at TIMESTAMPTZ,
    marketing_consent_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Инвариант «хотя бы один способ входа»: либо Telegram, либо email+пароль.
    CONSTRAINT users_login_method_check
      CHECK (tg_user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL))
  );

  -- Регистронезависимая уникальность email/username (partial — NULL допускают дубли).
  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
    ON users (lower(email)) WHERE email IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
    ON users (lower(username)) WHERE username IS NOT NULL;

  -- Сессии браузерной авторизации (opaque-токен хранится только как sha256-хеш).
  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS route_points (
    id SERIAL PRIMARY KEY,
    locality TEXT NOT NULL,
    district TEXT NOT NULL DEFAULT '',
    admin_area TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    kind TEXT NOT NULL DEFAULT 'stop' CHECK (kind IN ('stop', 'locality'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_route_point
    ON route_points(locality, district, admin_area, title);

  CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    start_point_id INTEGER NOT NULL REFERENCES route_points(id),
    end_point_id INTEGER NOT NULL REFERENCES route_points(id),
    trip_date TEXT NOT NULL DEFAULT '',
    departure_time TEXT NOT NULL DEFAULT '',
    time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'evening')),
    price_rub INTEGER NOT NULL,
    seats_total INTEGER NOT NULL,
    seats_booked INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    car_model TEXT,
    car_color TEXT,
    plate TEXT,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trips_status_date_route
    ON trips(status, trip_date, start_point_id, end_point_id);

  CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id),
    passenger_id INTEGER NOT NULL REFERENCES users(id),
    seats INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'cancelled_by_passenger', 'cancelled_by_driver')),
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMPTZ,
    UNIQUE(trip_id, passenger_id)
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_trip_status ON bookings(trip_id, status);
  CREATE INDEX IF NOT EXISTS idx_bookings_passenger_status ON bookings(passenger_id, status);

  CREATE TABLE IF NOT EXISTS trip_templates (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    start_point_id INTEGER NOT NULL REFERENCES route_points(id),
    end_point_id INTEGER NOT NULL REFERENCES route_points(id),
    time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'evening')),
    price_rub INTEGER NOT NULL,
    seats_total INTEGER NOT NULL,
    comment TEXT,
    car_color TEXT,
    plate TEXT,
    schedule_days TEXT,
    schedule_time TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trip_templates_driver ON trip_templates(driver_id);

  CREATE TABLE IF NOT EXISTS route_alerts (
    id SERIAL PRIMARY KEY,
    passenger_id INTEGER NOT NULL REFERENCES users(id),
    from_point_id INTEGER NOT NULL REFERENCES route_points(id),
    to_point_id INTEGER NOT NULL REFERENCES route_points(id),
    desired_date TEXT NOT NULL,
    desired_time TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'notified', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_route_alerts_passenger ON route_alerts(passenger_id);
  CREATE INDEX IF NOT EXISTS idx_route_alerts_route
    ON route_alerts(from_point_id, to_point_id, desired_date);
  CREATE INDEX IF NOT EXISTS idx_route_alerts_status ON route_alerts(status);

  CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id),
    rater_id INTEGER NOT NULL REFERENCES users(id),
    ratee_id INTEGER NOT NULL REFERENCES users(id),
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    tags TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trip_id, rater_id, ratee_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ratings_trip ON ratings(trip_id);
  CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);

  CREATE TABLE IF NOT EXISTS cars (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    model TEXT NOT NULL,
    color TEXT,
    plate TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_cars_driver ON cars(driver_id);

  CREATE TABLE IF NOT EXISTS license_requests (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    series_number TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewer TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_license_requests_driver ON license_requests(driver_id);
  CREATE INDEX IF NOT EXISTS idx_license_requests_status ON license_requests(status);

  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('booking', 'booking_confirmed', 'cancel', 'rate_reminder', 'trip_new')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    ref_trip_id INTEGER REFERENCES trips(id),
    ref_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
`;

/**
 * Применить одну линейную миграцию from_v → to_v.
 * v1→v2: добавление таблицы ratings + пересчёт агрегатов users.rating_avg/rating_count.
 * v2→v3: добавление car_color TEXT NULL, plate TEXT NULL в trips и trip_templates.
 * v3→v4: добавление таблицы license_requests (модерация ВУ).
 * v4→v5: добавление таблицы notifications (события для лент уведомлений).
 * v5→v6: добавление таблицы cars (машины водителя) + колонки trips.car_model.
 * v6→v7: расширение notifications.type — добавлен тип 'trip_new' (поездка по маршруту пассажира).
 * v7→v8: браузерная авторизация (issue #242) — tg_user_id NULLABLE, поля email/пароль/
 *        имя/согласия в users, уникальные индексы lower(email)/lower(username),
 *        CHECK «способ входа», таблица sessions. Безопасно для прод-БД (только ADD/ALTER).
 */
async function applyMigration(pool: Pool, fromV: number, toV: number): Promise<void> {
  if (fromV === 1 && toV === 2) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id),
        rater_id INTEGER NOT NULL REFERENCES users(id),
        ratee_id INTEGER NOT NULL REFERENCES users(id),
        stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
        tags TEXT,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(trip_id, rater_id, ratee_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ratings_trip ON ratings(trip_id);
      CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);
    `);
    return;
  }
  if (fromV === 2 && toV === 3) {
    await pool.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_color TEXT;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS plate TEXT;
      ALTER TABLE trip_templates ADD COLUMN IF NOT EXISTS car_color TEXT;
      ALTER TABLE trip_templates ADD COLUMN IF NOT EXISTS plate TEXT;
    `);
    return;
  }
  if (fromV === 3 && toV === 4) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_requests (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL REFERENCES users(id),
        series_number TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMPTZ,
        reviewer TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_license_requests_driver ON license_requests(driver_id);
      CREATE INDEX IF NOT EXISTS idx_license_requests_status ON license_requests(status);
    `);
    return;
  }
  if (fromV === 4 && toV === 5) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK (type IN ('booking', 'booking_confirmed', 'cancel', 'rate_reminder')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        ref_trip_id INTEGER REFERENCES trips(id),
        ref_user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
    `);
    return;
  }
  if (fromV === 5 && toV === 6) {
    await pool.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_model TEXT;

      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL REFERENCES users(id),
        model TEXT NOT NULL,
        color TEXT,
        plate TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cars_driver ON cars(driver_id);
    `);
    return;
  }
  if (fromV === 6 && toV === 7) {
    // Расширяем CHECK notifications.type типом 'trip_new'. Имя inline-констрейнта
    // в Postgres детерминировано — notifications_type_check.
    await pool.query(`
      ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
      ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
        CHECK (type IN ('booking', 'booking_confirmed', 'cancel', 'rate_reminder', 'trip_new'));
    `);
    return;
  }
  if (fromV === 7 && toV === 8) {
    // Браузерная авторизация (issue #242). Все шаги идемпотентны и аддитивны,
    // поэтому безопасно применяются на проде при старте.
    //
    // tg_user_id → NULLABLE: существующие Telegram-строки этим не затрагиваются
    // (UNIQUE сохраняется). Новые колонки добавляются IF NOT EXISTS.
    await pool.query(`
      ALTER TABLE users ALTER COLUMN tg_user_id DROP NOT NULL;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pdn_consent_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pdn_consent_version TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_version TEXT;

      -- Регистронезависимая уникальность; partial WHERE NOT NULL — NULL не конфликтуют.
      -- Telegram-usernames глобально уникальны в TG, поэтому коллизий при создании
      -- индекса на проде не ожидается (NULL у TG-юзеров без ника индекс игнорирует).
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
        ON users (lower(email)) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
        ON users (lower(username)) WHERE username IS NOT NULL;

      -- CHECK навешиваем идемпотентно (DROP IF EXISTS + ADD), как в миграции v6→v7.
      -- Существующие Telegram-строки удовлетворяют (tg_user_id IS NOT NULL).
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_login_method_check;
      ALTER TABLE users ADD CONSTRAINT users_login_method_check
        CHECK (tg_user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL));

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `);
    return;
  }
  throw new Error(`No migration defined from v${fromV} to v${toV}`);
}

/**
 * Создать схему с нуля или прогнать линейные миграции до текущей версии.
 * Свежая БД получает полный bootstrap; существующая мигрирует шаг за шагом.
 * Идемпотентно: bootstrap из CREATE ... IF NOT EXISTS.
 */
export async function initSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    )
  `);

  const res = await pool.query<{ version: number }>(
    'SELECT version FROM schema_version WHERE id = 1',
  );

  if (res.rows.length === 0) {
    await pool.query(BOOTSTRAP_SQL);
    await pool.query(
      'INSERT INTO schema_version(id, version) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
      [CURRENT_SCHEMA_VERSION],
    );
    return;
  }

  let v = res.rows[0].version;
  while (v < CURRENT_SCHEMA_VERSION) {
    const next = v + 1;
    await applyMigration(pool, v, next);
    await pool.query('UPDATE schema_version SET version = $1 WHERE id = 1', [next]);
    v = next;
  }
}
