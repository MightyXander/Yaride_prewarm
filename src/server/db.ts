/**
 * Соединение с PostgreSQL через пул node-postgres (pg.Pool).
 *
 * Конфигурация — из env DATABASE_URL (Railway). SSL включается управляемо через
 * env PGSSL (для Railway/managed Postgres, где сертификат self-signed):
 * PGSSL=require|true|1 → ssl: { rejectUnauthorized: false }.
 *
 * Пул асинхронный — в отличие от синхронного better-sqlite3 — поэтому весь
 * repo-слой переведён на async/Promise. Схема и сид прогоняются один раз при
 * первом старте (initDb из index.ts → ensureReady здесь).
 */

import { Pool } from 'pg';
import type { PoolClient } from 'pg';

import { initSchema } from './schema.ts';
import { seedIfEmpty } from './seed.ts';

let pool: Pool | null = null;
let readyPromise: Promise<void> | null = null;

/** Нужен ли SSL: управляется env PGSSL (require|true|1|on). */
function sslEnabled(): boolean {
  const v = (process.env.PGSSL ?? '').trim().toLowerCase();
  return v === 'require' || v === 'true' || v === '1' || v === 'on';
}

/**
 * Получить (создать один раз) пул соединений.
 * Без DATABASE_URL — понятная ошибка при старте.
 */
export function getPool(): Pool {
  if (pool !== null) {
    return pool;
  }

  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set. Set DATABASE_URL=postgres://user:pass@host:port/db ' +
        'before starting the data layer (Railway provides it automatically).',
    );
  }

  pool = new Pool({
    connectionString: url.trim(),
    ssl: sslEnabled() ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
}

/**
 * Гарантировать готовность БД: схема + сид прогоняются ровно один раз
 * (повторные вызовы ждут тот же промис). Идемпотентно.
 */
export function ensureReady(): Promise<void> {
  if (readyPromise !== null) {
    return readyPromise;
  }
  const p = getPool();
  readyPromise = (async () => {
    await initSchema(p);
    await seedIfEmpty(p);
  })();
  return readyPromise;
}

/** Выполнить функцию в транзакции на отдельном клиенте (BEGIN/COMMIT/ROLLBACK). */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Закрыть пул (для тестов / graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
    readyPromise = null;
  }
}
