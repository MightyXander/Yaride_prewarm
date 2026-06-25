/**
 * Схема БД и линейные миграции по версии (SQLite, better-sqlite3).
 *
 * Минимальный срез модели данных, перенесённый из основного репозитория
 * MightyXander/Yaride (app/db.py, CURRENT_SCHEMA_VERSION=14) под MVP «Один туннель».
 *
 * Перенесены таблицы: users, route_points, trips, bookings, trip_templates, route_alerts.
 * Опущены: chat_anchors, admin_*, trip_ratings, favorite_routes, analytics_events, trip_stops
 * и сопутствующие поля — они не нужны слою данных prewarm-MVP.
 *
 * Структура writeа под будущий перенос на Postgres (см. Yaride db_postgres.py):
 * избегаем SQLite-специфики там, где это дёшево; диалектные различия (AUTOINCREMENT,
 * BOOLEAN как INTEGER) изолированы здесь.
 */

import type Database from 'better-sqlite3';

/** Текущая версия схемы кода prewarm-слоя данных. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Полный bootstrap схемы для свежего файла .db. */
function bootstrapFullSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_user_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      username TEXT,
      age INTEGER,
      phone TEXT,
      rating_avg REAL NOT NULL DEFAULT 0.0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      trips_driver_count INTEGER NOT NULL DEFAULT 0,
      trips_passenger_count INTEGER NOT NULL DEFAULT 0,
      license_status TEXT NOT NULL DEFAULT 'none'
        CHECK(license_status IN ('none', 'pending', 'verified', 'rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS route_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locality TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      admin_area TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      kind TEXT NOT NULL DEFAULT 'stop' CHECK(kind IN ('stop', 'locality'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_route_point
      ON route_points(locality, district, admin_area, title);

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      start_point_id INTEGER NOT NULL,
      end_point_id INTEGER NOT NULL,
      trip_date TEXT NOT NULL DEFAULT '',
      departure_time TEXT NOT NULL DEFAULT '',
      time_slot TEXT NOT NULL CHECK(time_slot IN ('morning', 'evening')),
      price_rub INTEGER NOT NULL,
      seats_total INTEGER NOT NULL,
      seats_booked INTEGER NOT NULL DEFAULT 0,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open', 'cancelled', 'completed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(driver_id) REFERENCES users(id),
      FOREIGN KEY(start_point_id) REFERENCES route_points(id),
      FOREIGN KEY(end_point_id) REFERENCES route_points(id)
    );

    CREATE INDEX IF NOT EXISTS idx_trips_status_date_route
      ON trips(status, trip_date, start_point_id, end_point_id);

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      passenger_id INTEGER NOT NULL,
      seats INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'cancelled_by_passenger', 'cancelled_by_driver')),
      cancel_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cancelled_at TEXT,
      UNIQUE(trip_id, passenger_id),
      FOREIGN KEY(trip_id) REFERENCES trips(id),
      FOREIGN KEY(passenger_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_trip_status ON bookings(trip_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_passenger_status ON bookings(passenger_id, status);

    CREATE TABLE IF NOT EXISTS trip_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      start_point_id INTEGER NOT NULL,
      end_point_id INTEGER NOT NULL,
      time_slot TEXT NOT NULL CHECK(time_slot IN ('morning', 'evening')),
      price_rub INTEGER NOT NULL,
      seats_total INTEGER NOT NULL,
      comment TEXT,
      schedule_days TEXT,
      schedule_time TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(driver_id) REFERENCES users(id),
      FOREIGN KEY(start_point_id) REFERENCES route_points(id),
      FOREIGN KEY(end_point_id) REFERENCES route_points(id)
    );

    CREATE INDEX IF NOT EXISTS idx_trip_templates_driver ON trip_templates(driver_id);

    CREATE TABLE IF NOT EXISTS route_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      passenger_id INTEGER NOT NULL,
      from_point_id INTEGER NOT NULL,
      to_point_id INTEGER NOT NULL,
      desired_date TEXT NOT NULL,
      desired_time TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'notified', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(passenger_id) REFERENCES users(id),
      FOREIGN KEY(from_point_id) REFERENCES route_points(id),
      FOREIGN KEY(to_point_id) REFERENCES route_points(id)
    );

    CREATE INDEX IF NOT EXISTS idx_route_alerts_passenger ON route_alerts(passenger_id);
    CREATE INDEX IF NOT EXISTS idx_route_alerts_route
      ON route_alerts(from_point_id, to_point_id, desired_date);
    CREATE INDEX IF NOT EXISTS idx_route_alerts_status ON route_alerts(status);
  `);
}

/**
 * Применить одну линейную миграцию from_v → to_v.
 * Пока схема на v1 (полный bootstrap) и доп. миграций нет; задел под рост.
 */
function applyMigration(_db: Database.Database, fromV: number, toV: number): void {
  throw new Error(`No migration defined from v${fromV} to v${toV}`);
}

/**
 * Создать схему с нуля или прогнать линейные миграции до текущей версии.
 * Свежий .db получает полный bootstrap; существующий мигрирует шаг за шагом.
 */
export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      version INTEGER NOT NULL
    )
  `);

  const row = db
    .prepare('SELECT version FROM schema_version WHERE id = 1')
    .get() as { version: number } | undefined;

  if (row === undefined) {
    const tx = db.transaction(() => {
      bootstrapFullSchema(db);
      db.prepare('INSERT INTO schema_version(id, version) VALUES (1, ?)').run(
        CURRENT_SCHEMA_VERSION,
      );
    });
    tx();
    return;
  }

  let v = row.version;
  while (v < CURRENT_SCHEMA_VERSION) {
    const next = v + 1;
    const tx = db.transaction(() => {
      applyMigration(db, v, next);
      db.prepare('UPDATE schema_version SET version = ? WHERE id = 1').run(next);
    });
    tx();
    v = next;
  }
}
