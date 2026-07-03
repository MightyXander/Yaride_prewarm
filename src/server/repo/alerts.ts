/**
 * Заявки на маршрут (route_alerts): подписка на коридор/дату при пустом поиске,
 * управление статусом заявки (отмена через callback-кнопку в Telegram).
 * Вынесено из монолитного repo.ts (issue #289).
 *
 * ВНИМАНИЕ: createRouteAlert (tgUserId-обёртка) удалена как мёртвый код
 * (issue #289) — 0 внешних вызовов на момент рефакторинга. createRouteAlertById
 * (мост сессии, issue #258) — единственная используемая точка входа.
 */

import { ensureReady, withTransaction } from '../db.ts';
import { getInternalUserId } from './_shared.ts';

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
