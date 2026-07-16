/**
 * Сессии браузерной авторизации (issue #242): opaque-токен → хеш в БД.
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool } from '../db.ts';
import type { WebUserRecord } from './users.ts';

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
    `SELECT u.id, u.name, u.email, u.username, u.first_name, u.last_name, u.sex
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
