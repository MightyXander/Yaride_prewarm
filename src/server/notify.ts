/**
 * Модуль уведомлений пользователей через Telegram Bot API.
 *
 * Триггеры уведомлений (fire-and-forget, не блокируют API):
 *  1. Публикация поездки → пуш пассажирам по совпавшим route_alerts
 *  2. Бронь места → пуш водителю о новой брони
 *
 * Все ошибки sendMessage логируются, но не пробрасываются наружу (не ломают API).
 * Если BOT_TOKEN пуст — sendMessage логирует и выходит, уведомления no-op.
 */

import { getPool } from './db.ts';
import { sendMessage } from './telegram.ts';

/**
 * Отправить уведомления пассажирам по route_alerts, совпадающим с опубликованной поездкой.
 *
 * Логика матчинга:
 * - from_point_id = start_point_id поездки
 * - to_point_id = end_point_id поездки
 * - status = 'active'
 * - desired_date = trip_date поездки
 * - time_slot: вывести слот алерта из desired_time (час<12 → 'morning', час>=12 → 'evening',
 *   desired_time IS NULL → любой слот) и сматчить с time_slot поездки
 *
 * Кнопка «Открыть поездку» ведёт на deep-link: <MINIAPP_URL>?startapp=trip-<tripId>
 *
 * @param tripId ID опубликованной поездки
 * @param startPointId ID начальной точки
 * @param endPointId ID конечной точки
 * @param tripDate Дата поездки (YYYY-MM-DD)
 * @param timeSlot Слот времени поездки ('morning' | 'evening')
 * @param departureTime Время отправления (HH:MM)
 * @param startTitle Название начальной точки (для сообщения)
 * @param endTitle Название конечной точки (для сообщения)
 */
export async function notifyPassengersAboutNewTrip(params: {
  tripId: number;
  startPointId: number;
  endPointId: number;
  tripDate: string;
  timeSlot: 'morning' | 'evening';
  departureTime: string;
  startTitle: string;
  endTitle: string;
}): Promise<void> {
  try {
    const pool = getPool();

    // Найти совпадающие алерты (активные, по маршруту, дате и слоту)
    // Слот алерта вычисляется из desired_time:
    //   - час < 12 → 'morning'
    //   - час >= 12 → 'evening'
    //   - desired_time IS NULL → любой слот (не исключаем)
    const alertsRes = await pool.query<{
      passenger_id: number;
      tg_user_id: number;
    }>(
      `SELECT ra.passenger_id, u.tg_user_id
       FROM route_alerts ra
       JOIN users u ON u.id = ra.passenger_id
       WHERE ra.from_point_id = $1
         AND ra.to_point_id = $2
         AND ra.status = 'active'
         AND ra.desired_date = $3
         AND (
           ra.desired_time IS NULL
           OR (
             CASE
               WHEN CAST(SPLIT_PART(ra.desired_time, ':', 1) AS INTEGER) < 12 THEN 'morning'
               ELSE 'evening'
             END = $4
           )
         )`,
      [params.startPointId, params.endPointId, params.tripDate, params.timeSlot],
    );

    if (alertsRes.rows.length === 0) {
      // Нет подписчиков — ничего не делаем
      return;
    }

    const miniAppUrl = (process.env.MINIAPP_URL ?? '').trim();
    const text = `По вашему маршруту ${params.startTitle} → ${params.endTitle} появилась поездка на ${params.tripDate} в ${params.departureTime}.`;

    // Отправить каждому пассажиру (fire-and-forget)
    const promises = alertsRes.rows.map(async (row) => {
      const opts =
        miniAppUrl !== ''
          ? {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: 'Открыть поездку',
                      url: `${miniAppUrl}?startapp=trip-${params.tripId}`,
                    },
                  ],
                ],
              },
            }
          : undefined;

      await sendMessage(row.tg_user_id, text, opts);
    });

    await Promise.all(promises);
  } catch (err) {
    // Не ломаем API при ошибке уведомлений — только логируем
    console.error('[notifyPassengersAboutNewTrip] Ошибка уведомлений:', err);
  }
}

/**
 * Отправить уведомление водителю о новой брони.
 *
 * Кнопка «Открыть» ведёт на deep-link: <MINIAPP_URL>?startapp=trip-<tripId>
 *
 * @param tripId ID поездки
 * @param driverTgUserId Telegram ID водителя
 * @param passengerName Имя пассажира (для сообщения)
 * @param startTitle Название начальной точки
 * @param endTitle Название конечной точки
 * @param tripDate Дата поездки (YYYY-MM-DD)
 * @param departureTime Время отправления (HH:MM)
 * @param seatsBooked Количество забронированных мест
 */
export async function notifyDriverAboutNewBooking(params: {
  tripId: number;
  driverTgUserId: number;
  passengerName: string;
  startTitle: string;
  endTitle: string;
  tripDate: string;
  departureTime: string;
  seatsBooked: number;
}): Promise<void> {
  try {
    const miniAppUrl = (process.env.MINIAPP_URL ?? '').trim();
    const seatsText = params.seatsBooked === 1 ? 'место' : 'места';
    const text = `${params.passengerName} забронировал ${params.seatsBooked} ${seatsText} на поездку ${params.startTitle} → ${params.endTitle}, ${params.tripDate} ${params.departureTime}.`;

    const opts =
      miniAppUrl !== ''
        ? {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Открыть',
                    url: `${miniAppUrl}?startapp=trip-${params.tripId}`,
                  },
                ],
              ],
            },
          }
        : undefined;

    await sendMessage(params.driverTgUserId, text, opts);
  } catch (err) {
    // Не ломаем API при ошибке уведомлений — только логируем
    console.error('[notifyDriverAboutNewBooking] Ошибка уведомления:', err);
  }
}
