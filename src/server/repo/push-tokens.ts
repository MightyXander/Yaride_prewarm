/**
 * FCM push-токены устройств (issue #265).
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool } from '../db.ts';

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
