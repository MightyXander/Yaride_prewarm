/**
 * Уведомления пользователя: создание, лента, отметка прочитанным, ленивая
 * генерация напоминаний «оставьте отзыв» по завершённым поездкам.
 * Вынесено из монолитного repo.ts (issue #289).
 *
 * ВНИМАНИЕ: listNotifications и ensureRateReminders (tgUserId-обёртки) удалены
 * как мёртвый код (issue #289) — 0 внешних вызовов на момент рефакторинга.
 * *ById-варианты (мост сессии, issue #258) — единственные используемые точки входа.
 */

import { ensureReady, getPool } from '../db.ts';

/**
 * Типы уведомлений.
 */
export type NotificationType =
  | 'booking'
  | 'booking_confirmed'
  | 'cancel'
  | 'rate_reminder'
  | 'trip_new'
  | 'license_approved'
  | 'license_rejected';

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  ref_trip_id: number | null;
  ref_user_id: number | null;
  created_at: string;
}

export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  refTripId?: number | null;
  refUserId?: number | null;
}

/**
 * Создать уведомление для пользователя.
 */
export async function createNotification(params: CreateNotificationParams): Promise<number> {
  await ensureReady();
  const res = await getPool().query<{ id: number }>(
    `INSERT INTO notifications(user_id, type, title, body, ref_trip_id, ref_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      params.userId,
      params.type,
      params.title,
      params.body,
      params.refTripId ?? null,
      params.refUserId ?? null,
    ],
  );
  return res.rows[0].id;
}

/**
 * Пометить уведомление как прочитанное. Принадлежность проверяется по tg-id владельца.
 */
export async function markNotificationRead(notificationId: number, tgUserId: number): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    `UPDATE notifications n SET read = TRUE
     FROM users u
     WHERE n.id = $1 AND n.user_id = u.id AND u.tg_user_id = $2`,
    [notificationId, tgUserId],
  );
  return res.rowCount !== null && res.rowCount > 0;
}

// --- internal-id варианты уведомлений (мост сессии, issue #258) ---

export async function listNotificationsById(userId: number, limit = 50): Promise<NotificationItem[]> {
  await ensureReady();
  const res = await getPool().query<NotificationItem>(
    `SELECT n.id, n.type, n.title, n.body, n.read, n.ref_trip_id, n.ref_user_id, n.created_at
     FROM notifications n
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return res.rows;
}

export async function markNotificationReadById(notificationId: number, userId: number): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
    [notificationId, userId],
  );
  return res.rowCount !== null && res.rowCount > 0;
}

export async function ensureRateRemindersById(userId: number, today: string): Promise<void> {
  await ensureReady();
  await getPool().query(
    `INSERT INTO notifications (user_id, type, title, body, ref_trip_id, ref_user_id)
     SELECT b.passenger_id, 'rate_reminder', 'Оцените поездку',
            'Как прошла поездка ' || sp.title || ' → ' || ep.title || '? Оставьте оценку.',
            t.id, t.driver_id
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     JOIN route_points sp ON sp.id = t.start_point_id
     JOIN route_points ep ON ep.id = t.end_point_id
     WHERE b.passenger_id = $1
       AND b.status = 'active'
       AND t.status <> 'cancelled'
       AND t.trip_date < $2
       AND NOT EXISTS (
         SELECT 1 FROM ratings r WHERE r.trip_id = t.id AND r.rater_id = b.passenger_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = b.passenger_id AND n.type = 'rate_reminder' AND n.ref_trip_id = t.id
       )`,
    [userId, today],
  );
}
