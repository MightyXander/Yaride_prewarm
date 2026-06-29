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
 * Кнопки:
 * - «Открыть поездку» ведёт на deep-link: <MINIAPP_URL>?startapp=trip-<tripId>
 * - «🔕 Снять заявку» callback_data=`al:cxl:<alertId>` для отмены алерта
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
      alert_id: number;
      passenger_id: number;
      tg_user_id: number;
    }>(
      `SELECT ra.id AS alert_id, ra.passenger_id, u.tg_user_id
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
      const buttons: Array<{ text: string; url?: string; callback_data?: string }> = [];

      if (miniAppUrl !== '') {
        buttons.push({
          text: 'Открыть поездку',
          url: `${miniAppUrl}?startapp=trip-${params.tripId}`,
        });
      }

      buttons.push({
        text: '🔕 Снять заявку',
        callback_data: `al:cxl:${row.alert_id}`,
      });

      const opts = {
        reply_markup: {
          inline_keyboard: [buttons],
        },
      };

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
 * Кнопки:
 * - «Открыть» ведёт на deep-link: <MINIAPP_URL>?startapp=trip-<tripId>
 * - «✅ Подтвердить» callback_data=`bk:cfm:<bookingId>`
 * - «❌ Отклонить» callback_data=`bk:dec:<bookingId>`
 *
 * @param tripId ID поездки
 * @param bookingId ID брони
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
  bookingId: number;
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

    const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];

    if (miniAppUrl !== '') {
      buttons.push([
        {
          text: 'Открыть',
          url: `${miniAppUrl}?startapp=trip-${params.tripId}`,
        },
      ]);
    }

    buttons.push([
      {
        text: '✅ Подтвердить',
        callback_data: `bk:cfm:${params.bookingId}`,
      },
      {
        text: '❌ Отклонить',
        callback_data: `bk:dec:${params.bookingId}`,
      },
    ]);

    const opts = {
      reply_markup: {
        inline_keyboard: buttons,
      },
    };

    await sendMessage(params.driverTgUserId, text, opts);
  } catch (err) {
    // Не ломаем API при ошибке уведомлений — только логируем
    console.error('[notifyDriverAboutNewBooking] Ошибка уведомления:', err);
  }
}

/**
 * Уведомить администратора о новой заявке на проверку ВУ.
 *
 * Сообщение уходит в чат ADMIN_CHAT_ID (числовой Telegram ID @mightyxander)
 * с двумя кнопками модерации:
 * - «✅ Подтвердить ВУ» callback_data=`lic:ok:<requestId>`
 * - «❌ Отклонить»       callback_data=`lic:no:<requestId>`
 *
 * Если ADMIN_CHAT_ID не задан — no-op (логируем и выходим), чтобы submit-заявки
 * не падал на окружениях без настроенной админки.
 *
 * @param requestId ID заявки (license_requests.id)
 * @param driverName Имя водителя (для текста)
 * @param seriesNumber Серия/номер ВУ
 * @param validUntil Срок действия ВУ (как ввёл водитель)
 */
export async function notifyAdminAboutLicenseRequest(params: {
  requestId: number;
  driverName: string;
  seriesNumber: string;
  validUntil: string;
}): Promise<void> {
  try {
    const adminChatId = Number((process.env.ADMIN_CHAT_ID ?? '').trim());
    if (!adminChatId) {
      console.log(
        '[notifyAdminAboutLicenseRequest] ADMIN_CHAT_ID не задан — уведомление админу пропущено',
      );
      return;
    }

    const text =
      `Новая заявка на проверку ВУ.\n\n` +
      `Водитель: ${params.driverName}\n` +
      `Серия/номер: ${params.seriesNumber}\n` +
      `Действует до: ${params.validUntil}`;

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Подтвердить ВУ', callback_data: `lic:ok:${params.requestId}` },
            { text: '❌ Отклонить', callback_data: `lic:no:${params.requestId}` },
          ],
        ],
      },
    };

    await sendMessage(adminChatId, text, opts);
  } catch (err) {
    // Не ломаем API при ошибке уведомления — только логируем
    console.error('[notifyAdminAboutLicenseRequest] Ошибка уведомления админа:', err);
  }
}

/**
 * Уведомить водителя о решении админа по заявке на проверку ВУ.
 *
 * @param driverTgUserId Telegram ID водителя
 * @param approved true — одобрено (license_status=verified), false — отклонено
 */
export async function notifyDriverAboutLicenseDecision(params: {
  driverTgUserId: number;
  approved: boolean;
}): Promise<void> {
  try {
    const text = params.approved
      ? 'Заявка водителя одобрена. Теперь можно создавать поездки в «поехали вместе».'
      : 'Заявка водителя отклонена. Проверь данные ВУ и подай заявку заново через профиль.';

    await sendMessage(params.driverTgUserId, text);
  } catch (err) {
    // Не ломаем обработку callback при ошибке уведомления — только логируем
    console.error('[notifyDriverAboutLicenseDecision] Ошибка уведомления водителя:', err);
  }
}
