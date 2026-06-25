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

/** Дефолт имени схемы, если env DB_SCHEMA не задан. */
const DEFAULT_SCHEMA = 'prewarm';

/**
 * Допустимый идентификатор Postgres-схемы. Имя схемы НЕ может быть передано
 * параметром $1 — оно подставляется в SQL текстом (SET search_path / CREATE SCHEMA),
 * поэтому жёстко ограничиваем алфавит, чтобы исключить SQL-инъекцию.
 */
const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/;

let cachedSchema: string | null = null;

/**
 * Имя prewarm-схемы из env DB_SCHEMA (дефолт `prewarm`), провалидированное
 * регуляркой `^[a-z_][a-z0-9_]*$`. Невалидное имя — немедленная ошибка старта.
 */
export function getSchemaName(): string {
  if (cachedSchema !== null) {
    return cachedSchema;
  }
  const raw = (process.env.DB_SCHEMA ?? '').trim();
  const name = raw === '' ? DEFAULT_SCHEMA : raw;
  if (!SCHEMA_NAME_RE.test(name)) {
    throw new Error(
      `Invalid DB_SCHEMA "${name}": schema name must match /^[a-z_][a-z0-9_]*$/ ` +
        '(lowercase letters, digits and underscores; cannot start with a digit). ' +
        'Schema name is interpolated into SQL verbatim, so it must be a safe identifier.',
    );
  }
  cachedSchema = name;
  return name;
}

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

  // Имя схемы валидируем заранее (бросит при невалидном DB_SCHEMA до создания пула).
  const schema = getSchemaName();

  pool = new Pool({
    connectionString: url.trim(),
    ssl: sslEnabled() ? { rejectUnauthorized: false } : undefined,
  });

  // На КАЖДОМ новом физическом соединении пула выставляем search_path в prewarm-схему.
  // Имя уже провалидировано SCHEMA_NAME_RE, поэтому подстановка текстом безопасна.
  // Так все CREATE TABLE/INDEX и запросы repo резолвятся в prewarm БЕЗ их правки.
  pool.on('connect', (client) => {
    void client.query('SET search_path TO ' + schema);
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
  const schema = getSchemaName();
  readyPromise = (async () => {
    // CREATE SCHEMA должен идти ПЕРВЫМ, до любых CREATE TABLE: берём отдельного
    // клиента и явно создаём схему (на новом соединении connect-хендлер уже
    // выставит search_path, но создание схемы от него не зависит). Затем
    // подстраховываемся явным SET search_path на этом же клиенте — чтобы все
    // последующие DDL/сид на нём гарантированно били в prewarm-схему.
    const client = await p.connect();
    try {
      await client.query('CREATE SCHEMA IF NOT EXISTS ' + schema);
      await client.query('SET search_path TO ' + schema);
    } finally {
      client.release();
    }
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
    cachedSchema = null;
  }
}
