/**
 * Внутренние хелперы repo-слоя, общие для нескольких доменных модулей.
 *
 * Вынесены из монолитного repo.ts (issue #289): резолв внутреннего users.id
 * по telegram-id используется почти во всех доменах (мост сессии, issue #258),
 * пересчёт денормализованных счётчиков поездок — в bookings и templates.
 */

import type { PoolClient } from 'pg';

import { ensureReady, getPool } from '../db.ts';

/** Получить внутренний user.id по telegram-id (или null). */
export async function getInternalUserId(
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

/**
 * Пересчитать денормализованные счётчики поездок пользователя из источников.
 * Recompute-on-write (без дрейфа): trips_driver_count — число неотменённых
 * поездок, где он водитель; trips_passenger_count — число активных броней.
 * Вызывается ВНУТРИ транзакции после мутаций (публикация / бронь / отмены).
 * rating_avg/rating_count поддерживаются отдельно в createRating.
 */
export async function recomputeUserTripCounters(
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
