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
export const CURRENT_SCHEMA_VERSION = 1;

/** Полный bootstrap схемы для свежей БД (идемпотентно). */
const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tg_user_id BIGINT UNIQUE NOT NULL,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

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
`;

/**
 * Применить одну линейную миграцию from_v → to_v.
 * Пока схема на v1 (полный bootstrap) и доп. миграций нет; задел под рост.
 */
function applyMigration(_pool: Pool, fromV: number, toV: number): never {
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
    applyMigration(pool, v, next);
    await pool.query('UPDATE schema_version SET version = $1 WHERE id = 1', [next]);
    v = next;
  }
}
