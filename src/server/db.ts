/**
 * Соединение с SQLite (better-sqlite3): путь из env DB_PATH с локальным фолбэком,
 * оптимальные PRAGMA и инициализация схемы + сида при первом старте.
 *
 * better-sqlite3 синхронный — для single-process Express-сервиса этого достаточно
 * и проще, чем asyncio-обёртка из основного Yaride. WAL включён по тем же причинам.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { initSchema } from './schema.ts';
import { seedIfEmpty } from './seed.ts';

let instance: Database.Database | null = null;

/** Абсолютный путь к файлу БД: env DB_PATH (Railway volume) или локальный фолбэк. */
export function resolveDbPath(): string {
  const fromEnv = process.env.DB_PATH;
  if (fromEnv && fromEnv.trim() !== '') {
    return path.resolve(fromEnv.trim());
  }
  // Фолбэк: <repo-root>/data/yaride_prewarm.db. server.js запускается из корня репо,
  // поэтому опираемся на cwd, а не на расположение собранного модуля.
  return path.join(process.cwd(), 'data', 'yaride_prewarm.db');
}

/** Открыть (один раз) соединение, применить PRAGMA, прогнать схему и сид. */
export function getDb(): Database.Database {
  if (instance !== null) {
    return instance;
  }

  const dbPath = resolveDbPath();
  // better-sqlite3 не создаёт родительский каталог сам — для Railway volume и
  // локального фолбэка гарантируем его существование.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  initSchema(db);
  seedIfEmpty(db);

  instance = db;
  return db;
}

/** Закрыть соединение (для тестов / graceful shutdown). */
export function closeDb(): void {
  if (instance !== null) {
    instance.close();
    instance = null;
  }
}
