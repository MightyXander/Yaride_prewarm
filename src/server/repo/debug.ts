/**
 * Диагностика наполнения БД (dev/прод demo-seed).
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool } from '../db.ts';
import { todayISO } from '../seed.ts';

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
