/**
 * Заявки на маршрут (route_alerts): подписка на коридор/дату при пустом поиске,
 * управление статусом заявки (отмена через callback-кнопку в Telegram).
 * Вынесено из монолитного repo.ts (issue #289).
 *
 * ВНИМАНИЕ: createRouteAlert (tgUserId-обёртка) удалена как мёртвый код
 * (issue #289) — 0 внешних вызовов на момент рефакторинга. createRouteAlertById
 * (мост сессии, issue #258) — единственная используемая точка входа.
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';
import { getInternalUserId } from './_shared.ts';
import { todayMskISO } from '../time.ts';

export interface RouteAlertParams {
  tgPassengerId: number;
  fromPointId: number;
  toPointId: number;
  desiredDate: string;
  desiredTime?: string | null;
}

export interface RouteAlertResult {
  alertId: number;
  passengerId: number;
  fromPointId: number;
  toPointId: number;
  desiredDate: string;
  desiredTime: string | null;
  status: string;
}

/** Заявка на маршрут по внутреннему users.id пассажира (мост сессии, issue #258). */
export async function createRouteAlertById(
  passengerId: number,
  params: Omit<RouteAlertParams, 'tgPassengerId'>,
): Promise<RouteAlertResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<RouteAlertResult> => {
    const pointsRes = await client.query<{ id: number }>(
      'SELECT id FROM route_points WHERE id = ANY($1::int[])',
      [[params.fromPointId, params.toPointId]],
    );
    const foundIds = new Set(pointsRes.rows.map((r) => r.id));
    if (!foundIds.has(params.fromPointId) || !foundIds.has(params.toPointId)) {
      throw new Error('Точка маршрута не найдена.');
    }

    const ins = await client.query<{
      id: number;
      desired_time: string | null;
      status: string;
    }>(
      `INSERT INTO route_alerts(passenger_id, from_point_id, to_point_id,
                                desired_date, desired_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, desired_time, status`,
      [
        passengerId,
        params.fromPointId,
        params.toPointId,
        params.desiredDate,
        params.desiredTime ?? null,
      ],
    );
    const row = ins.rows[0];
    return {
      alertId: row.id,
      passengerId,
      fromPointId: params.fromPointId,
      toPointId: params.toPointId,
      desiredDate: params.desiredDate,
      desiredTime: row.desired_time,
      status: row.status,
    };
  });
}

export interface UpdateAlertStatusResult {
  alertId: number;
  status: string;
}

/**
 * Обновить статус route_alert (для отмены через callback-кнопку в Telegram).
 *
 * @param alertId ID алерта
 * @param newStatus Новый статус ('cancelled', 'active', 'notified')
 * @param tgPassengerId Telegram ID пассажира (владелец алерта)
 * @returns Обновлённый статус
 */
export async function updateAlertStatus(
  alertId: number,
  newStatus: 'active' | 'notified' | 'cancelled',
  tgPassengerId: number,
): Promise<UpdateAlertStatusResult> {
  await ensureReady();

  return withTransaction(async (client) => {
    const passengerId = await getInternalUserId(client, tgPassengerId);
    if (passengerId === null) {
      throw new Error('Профиль пассажира не найден.');
    }

    const alertRes = await client.query<{
      id: number;
      passenger_id: number;
      status: string;
    }>(
      'SELECT id, passenger_id, status FROM route_alerts WHERE id = $1',
      [alertId],
    );
    const alert = alertRes.rows[0];

    if (!alert) {
      throw new Error('Заявка не найдена.');
    }
    if (alert.passenger_id !== passengerId) {
      throw new Error('Вы не владелец этой заявки.');
    }

    const upd = await client.query<{ id: number; status: string }>(
      'UPDATE route_alerts SET status = $1 WHERE id = $2 RETURNING id, status',
      [newStatus, alertId],
    );

    return {
      alertId: upd.rows[0].id,
      status: upd.rows[0].status,
    };
  });
}

/** Различимые причины отказа отмены — для точного статус-маппинга в api.ts (issue #319). */
export class AlertNotFoundError extends Error {}
export class AlertNotOwnerError extends Error {}

/**
 * Отменить заявку-алерт по внутреннему users.id автора (мост сессии, issue #258,
 * тот же режим, что и createRouteAlertById; HTTP-аналог updateAlertStatus,
 * который работает по tgPassengerId для Telegram callback-кнопки).
 *
 * Доступ — только автор заявки: AlertNotFoundError, если заявки нет,
 * AlertNotOwnerError, если это чужая заявка (issue #319).
 */
export async function cancelRouteAlertById(
  alertId: number,
  passengerId: number,
): Promise<UpdateAlertStatusResult> {
  await ensureReady();

  return withTransaction(async (client) => {
    const alertRes = await client.query<{
      id: number;
      passenger_id: number;
      status: string;
    }>(
      'SELECT id, passenger_id, status FROM route_alerts WHERE id = $1',
      [alertId],
    );
    const alert = alertRes.rows[0];

    if (!alert) {
      throw new AlertNotFoundError('Заявка не найдена.');
    }
    if (alert.passenger_id !== passengerId) {
      throw new AlertNotOwnerError('Вы не владелец этой заявки.');
    }

    const upd = await client.query<{ id: number; status: string }>(
      "UPDATE route_alerts SET status = 'cancelled' WHERE id = $1 RETURNING id, status",
      [alertId],
    );

    return {
      alertId: upd.rows[0].id,
      status: upd.rows[0].status,
    };
  });
}

export interface MyAlertItem {
  id: number;
  fromPointId: number;
  toPointId: number;
  fromTitle: string;
  toTitle: string;
  desiredDate: string;
  desiredTime: string | null;
  status: string;
  createdAt: string;
}

/**
 * Активные заявки текущего юзера для GET /api/me/alerts (issue #321).
 *
 * «Активные» = status='active' И desired_date ещё не в прошлом. В схеме нет
 * фонового job'а, который переводит просроченные заявки в отдельный статус
 * (route_alerts.status — только active/notified/cancelled), поэтому просрочку
 * считаем на чтении по дате — тот же приём, что getUserTripsById использует
 * для upcoming/past (сравнение с todayMskISO() в SQL, не в JS).
 */
export async function listActiveAlertsByPassengerId(
  passengerId: number,
): Promise<MyAlertItem[]> {
  await ensureReady();
  const pool = getPool();
  const today = todayMskISO();

  const res = await pool.query<{
    id: number;
    from_point_id: number;
    to_point_id: number;
    from_title: string;
    to_title: string;
    desired_date: string;
    desired_time: string | null;
    status: string;
    created_at: string;
  }>(
    `SELECT ra.id, ra.from_point_id, ra.to_point_id,
            fp.title AS from_title, tp.title AS to_title,
            ra.desired_date, ra.desired_time, ra.status, ra.created_at
     FROM route_alerts ra
     JOIN route_points fp ON fp.id = ra.from_point_id
     JOIN route_points tp ON tp.id = ra.to_point_id
     WHERE ra.passenger_id = $1 AND ra.status = 'active' AND ra.desired_date >= $2
     ORDER BY ra.desired_date ASC, ra.desired_time ASC`,
    [passengerId, today],
  );

  return res.rows.map((r) => ({
    id: r.id,
    fromPointId: r.from_point_id,
    toPointId: r.to_point_id,
    fromTitle: r.from_title,
    toTitle: r.to_title,
    desiredDate: r.desired_date,
    desiredTime: r.desired_time,
    status: r.status,
    createdAt: r.created_at,
  }));
}
