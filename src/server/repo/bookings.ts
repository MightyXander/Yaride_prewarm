/**
 * Брони мест на поездках: создание (защита от гонок за места), список броней
 * поездки для водителя, отмена брони/поездки, подтверждение брони.
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';
import { getInternalUserId, internalUserIdByTg, recomputeUserTripCounters } from './_shared.ts';

export interface BookingResult {
  bookingId: number;
  tripId: number;
  seatsAvailable: number;
}

/**
 * Создать бронь места на поездке для пассажира (по telegram-id).
 *
 * Атомарно в транзакции (BEGIN/COMMIT): проверка доступности → UPDATE seats_booked
 * с условием seats_booked + seats <= seats_total и status='open' (защита от двойной
 * брони последнего места и перебронирования) → INSERT/реактивация booking.
 * Бросает Error с понятным текстом при недоступности.
 */
export async function createBooking(
  tgPassengerId: number,
  tripId: number,
  seats = 1,
): Promise<BookingResult> {
  const passengerId = await internalUserIdByTg(tgPassengerId);
  if (passengerId === null) {
    throw new Error('Профиль пассажира не найден.');
  }
  return createBookingById(passengerId, tripId, seats);
}

/** Бронь по внутреннему users.id пассажира (мост сессии, issue #258). */
export async function createBookingById(
  passengerId: number,
  tripId: number,
  seats = 1,
): Promise<BookingResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<BookingResult> => {
    const tripRes = await client.query<{
      id: number;
      status: string;
      seats_total: number;
      seats_booked: number;
      driver_id: number;
      driver_tg_user_id: number;
    }>(
      `SELECT t.id, t.status, t.seats_total, t.seats_booked, t.driver_id,
              d.tg_user_id AS driver_tg_user_id
       FROM trips t JOIN users d ON d.id = t.driver_id
       WHERE t.id = $1`,
      [tripId],
    );
    const trip = tripRes.rows[0];

    if (!trip) {
      throw new Error('Поездка не найдена.');
    }
    if (trip.status !== 'open') {
      throw new Error('Поездка недоступна.');
    }
    if (trip.driver_id === passengerId) {
      throw new Error('Нельзя бронировать свою поездку.');
    }

    const existingRes = await client.query<{ id: number; status: string }>(
      'SELECT id, status FROM bookings WHERE trip_id = $1 AND passenger_id = $2',
      [tripId, passengerId],
    );
    const existing = existingRes.rows[0];
    if (existing && existing.status === 'active') {
      throw new Error('Вы уже забронировали эту поездку.');
    }

    // Захватить места: условие в WHERE гарантирует, что не уйдём в минус.
    // RETURNING подтверждает успешный захват (rowCount === 1).
    const upd = await client.query(
      `UPDATE trips SET seats_booked = seats_booked + $1
       WHERE id = $2 AND status = 'open' AND seats_booked + $1 <= seats_total
       RETURNING id`,
      [seats, tripId],
    );
    if (upd.rowCount !== 1) {
      throw new Error('Свободных мест нет.');
    }

    let bookingId: number;
    if (existing) {
      await client.query(
        `UPDATE bookings
         SET status = 'active', seats = $1, cancel_reason = NULL, cancelled_at = NULL,
             created_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [seats, existing.id],
      );
      bookingId = existing.id;
    } else {
      const ins = await client.query<{ id: number }>(
        'INSERT INTO bookings(trip_id, passenger_id, seats) VALUES ($1, $2, $3) RETURNING id',
        [tripId, passengerId, seats],
      );
      bookingId = ins.rows[0].id;
    }

    // Денормализованный счётчик пассажира — пересчёт из источника.
    await recomputeUserTripCounters(client, passengerId);

    const afterRes = await client.query<{ avail: number }>(
      'SELECT seats_total - seats_booked AS avail FROM trips WHERE id = $1',
      [tripId],
    );

    return { bookingId, tripId, seatsAvailable: afterRes.rows[0].avail };
  });
}

export interface BookingDetail {
  booking_id: number;
  passenger_id: number;
  passenger_name: string;
  passenger_username: string | null;
  seats: number;
  status: string;
  created_at: string;
  /** Телефон пассажира — отдаётся ТОЛЬКО водителю поездки и ТОЛЬКО для активной брони, иначе NULL. */
  passenger_phone: string | null;
}

/** Результат запроса броней поездки: либо список, либо причина отказа (нет поездки / не владелец). */
export type TripBookingsResult =
  | { ok: true; bookings: BookingDetail[] }
  | { ok: false; reason: 'not_found' | 'forbidden' };

/**
 * Список броней для поездки (для водителя, GET /api/trips/:id/bookings).
 * СКОУП НА ВЛАДЕЛЬЦА: брони отдаются только водителю поездки (requesterUserId);
 * любому другому — { ok:false, reason:'forbidden' } (закрывает IDOR на чтение броней).
 * passenger_phone раскрывается только для активных броней.
 */
export async function getTripBookings(
  tripId: number,
  requesterUserId: number,
): Promise<TripBookingsResult> {
  await ensureReady();
  // Владение поездкой: проверяем, что запрашивающий — её водитель.
  const ownerRes = await getPool().query<{ driver_id: number }>(
    'SELECT driver_id FROM trips WHERE id = $1',
    [tripId],
  );
  const owner = ownerRes.rows[0];
  if (!owner) {
    return { ok: false, reason: 'not_found' };
  }
  if (owner.driver_id !== requesterUserId) {
    return { ok: false, reason: 'forbidden' };
  }

  const res = await getPool().query<BookingDetail>(
    `SELECT b.id AS booking_id, b.passenger_id, u.name AS passenger_name,
            u.username AS passenger_username, b.seats, b.status, b.created_at,
            CASE WHEN b.status = 'active' THEN u.phone ELSE NULL END AS passenger_phone
     FROM bookings b
     JOIN users u ON u.id = b.passenger_id
     WHERE b.trip_id = $1
     ORDER BY b.created_at ASC`,
    [tripId],
  );
  return { ok: true, bookings: res.rows };
}

export interface CancelBookingResult {
  bookingId: number;
  tripId: number;
  seatsFreed: number;
  newAvailable: number;
}

/** Данные брони + пассажира + поездки для построения уведомлений (подтверждение/отмена). */
export interface BookingActionResult {
  bookingId: number;
  tripId: number;
  passengerId: number;
  passengerTgUserId: number;
  passengerName: string;
  seats: number;
  startTitle: string;
  endTitle: string;
  tripDate: string;
  departureTime: string;
}

/** Результат отмены брони водителем: освобождённые места + данные для уведомления пассажиру. */
export type CancelBookingActionResult = BookingActionResult & {
  seatsFreed: number;
  newAvailable: number;
};

/** Пассажир активной брони отменяемой поездки (для уведомлений). */
export interface AffectedPassenger {
  passengerId: number;
  passengerTgUserId: number;
  seats: number;
}

/** Результат отмены всей поездки водителем: данные поездки + затронутые пассажиры. */
export interface CancelTripResult {
  tripId: number;
  startTitle: string;
  endTitle: string;
  tripDate: string;
  departureTime: string;
  passengers: AffectedPassenger[];
}

/**
 * Отменить бронь водителем (PATCH /api/bookings/:id action='cancel_by_driver').
 * Переводит бронь в status='cancelled_by_driver', освобождает seats в trips.seats_booked.
 * Бросает Error если бронь не найдена или уже отменена.
 */
export async function cancelBookingByDriver(
  bookingId: number,
  tgDriverId: number,
): Promise<CancelBookingActionResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CancelBookingActionResult> => {
    const driverId = await getInternalUserId(client, tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    const bookingRes = await client.query<{
      id: number;
      trip_id: number;
      status: string;
      seats: number;
      driver_id: number;
      passenger_id: number;
      passenger_tg_user_id: string;
      passenger_name: string;
      start_title: string;
      end_title: string;
      trip_date: string;
      departure_time: string;
    }>(
      `SELECT b.id, b.trip_id, b.status, b.seats, t.driver_id,
              b.passenger_id, u.tg_user_id AS passenger_tg_user_id, u.name AS passenger_name,
              sp.title AS start_title, ep.title AS end_title,
              t.trip_date, t.departure_time
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN users u ON u.id = b.passenger_id
       JOIN route_points sp ON sp.id = t.start_point_id
       JOIN route_points ep ON ep.id = t.end_point_id
       WHERE b.id = $1`,
      [bookingId],
    );
    const booking = bookingRes.rows[0];

    if (!booking) {
      throw new Error('Бронь не найдена.');
    }
    if (booking.driver_id !== driverId) {
      throw new Error('Вы не водитель этой поездки.');
    }
    if (booking.status !== 'active') {
      throw new Error('Бронь уже отменена или недоступна.');
    }

    // Отменить бронь
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled_by_driver', cancelled_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [bookingId],
    );

    // Освободить места
    await client.query(
      'UPDATE trips SET seats_booked = seats_booked - $1 WHERE id = $2',
      [booking.seats, booking.trip_id],
    );

    // Бронь снята — пересчитать счётчик пассажира.
    await recomputeUserTripCounters(client, booking.passenger_id);

    const availRes = await client.query<{ avail: number }>(
      'SELECT seats_total - seats_booked AS avail FROM trips WHERE id = $1',
      [booking.trip_id],
    );

    return {
      bookingId,
      tripId: booking.trip_id,
      passengerId: booking.passenger_id,
      passengerTgUserId: Number(booking.passenger_tg_user_id),
      passengerName: booking.passenger_name,
      seats: booking.seats,
      startTitle: booking.start_title,
      endTitle: booking.end_title,
      tripDate: booking.trip_date,
      departureTime: booking.departure_time,
      seatsFreed: booking.seats,
      newAvailable: availRes.rows[0].avail,
    };
  });
}

/**
 * Отменить всю поездку водителем (POST /api/trips/:id/cancel).
 * Переводит trips.status='cancelled', отменяет все активные брони (cancelled_by_driver).
 * Возвращает данные поездки и список затронутых пассажиров для уведомлений.
 * Бросает Error при отсутствии поездки/прав/неоткрытом статусе.
 */
export async function cancelTripByDriver(
  tripId: number,
  tgDriverId: number,
): Promise<CancelTripResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CancelTripResult> => {
    const driverId = await getInternalUserId(client, tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    const tripRes = await client.query<{
      id: number;
      driver_id: number;
      status: string;
      start_title: string;
      end_title: string;
      trip_date: string;
      departure_time: string;
    }>(
      `SELECT t.id, t.driver_id, t.status,
              sp.title AS start_title, ep.title AS end_title,
              t.trip_date, t.departure_time
       FROM trips t
       JOIN route_points sp ON sp.id = t.start_point_id
       JOIN route_points ep ON ep.id = t.end_point_id
       WHERE t.id = $1`,
      [tripId],
    );
    const trip = tripRes.rows[0];

    if (!trip) {
      throw new Error('Поездка не найдена.');
    }
    if (trip.driver_id !== driverId) {
      throw new Error('Вы не водитель этой поездки.');
    }
    if (trip.status !== 'open') {
      throw new Error('Поездка уже отменена или завершена.');
    }

    // Список активных пассажиров (для уведомлений) — собираем до отмены броней
    const passengersRes = await client.query<{
      passenger_id: number;
      passenger_tg_user_id: string;
      seats: number;
    }>(
      `SELECT b.passenger_id, u.tg_user_id AS passenger_tg_user_id, b.seats
       FROM bookings b
       JOIN users u ON u.id = b.passenger_id
       WHERE b.trip_id = $1 AND b.status = 'active'`,
      [tripId],
    );

    await client.query(`UPDATE trips SET status = 'cancelled' WHERE id = $1`, [tripId]);
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled_by_driver', cancelled_at = CURRENT_TIMESTAMP
       WHERE trip_id = $1 AND status = 'active'`,
      [tripId],
    );

    // Поездка отменена — пересчитать счётчик водителя и всех затронутых пассажиров.
    await recomputeUserTripCounters(client, driverId);
    for (const p of passengersRes.rows) {
      await recomputeUserTripCounters(client, p.passenger_id);
    }

    return {
      tripId,
      startTitle: trip.start_title,
      endTitle: trip.end_title,
      tripDate: trip.trip_date,
      departureTime: trip.departure_time,
      passengers: passengersRes.rows.map((r) => ({
        passengerId: r.passenger_id,
        passengerTgUserId: Number(r.passenger_tg_user_id),
        seats: r.seats,
      })),
    };
  });
}

/**
 * Подтвердить бронь водителем (callback-кнопка в Telegram).
 * Переводит бронь в status='confirmed' (добавим новый статус или оставим 'active'?
 * В схеме нет 'confirmed', поэтому просто проверяем, что бронь активна).
 * В текущей схеме bookings.status: 'active' | 'cancelled_by_passenger' | 'cancelled_by_driver'.
 * Для подтверждения можно оставить 'active' (уже подтверждено созданием).
 * Эта функция просто проверяет, что бронь принадлежит поездке водителя и активна.
 * Возвращает подтверждение без изменения status.
 *
 * @param bookingId ID брони
 * @param tgDriverId Telegram ID водителя
 * @returns Детали брони (пассажир, места, статус)
 */
export async function confirmBookingByDriver(
  bookingId: number,
  tgDriverId: number,
): Promise<BookingActionResult> {
  await ensureReady();

  return withTransaction(async (client) => {
    const driverId = await getInternalUserId(client, tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    const bookingRes = await client.query<{
      id: number;
      trip_id: number;
      status: string;
      seats: number;
      driver_id: number;
      passenger_id: number;
      passenger_tg_user_id: string;
      passenger_name: string;
      start_title: string;
      end_title: string;
      trip_date: string;
      departure_time: string;
    }>(
      `SELECT b.id, b.trip_id, b.status, b.seats, t.driver_id,
              b.passenger_id, u.tg_user_id AS passenger_tg_user_id, u.name AS passenger_name,
              sp.title AS start_title, ep.title AS end_title,
              t.trip_date, t.departure_time
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN users u ON u.id = b.passenger_id
       JOIN route_points sp ON sp.id = t.start_point_id
       JOIN route_points ep ON ep.id = t.end_point_id
       WHERE b.id = $1`,
      [bookingId],
    );
    const booking = bookingRes.rows[0];

    if (!booking) {
      throw new Error('Бронь не найдена.');
    }
    if (booking.driver_id !== driverId) {
      throw new Error('Вы не водитель этой поездки.');
    }
    if (booking.status !== 'active') {
      throw new Error('Бронь уже отменена или недоступна.');
    }

    // В текущей схеме нет статуса 'confirmed', поэтому просто возвращаем подтверждение
    // (бронь уже активна с момента создания). Данные нужны для уведомления пассажиру.
    return {
      bookingId: booking.id,
      tripId: booking.trip_id,
      passengerId: booking.passenger_id,
      passengerTgUserId: Number(booking.passenger_tg_user_id),
      passengerName: booking.passenger_name,
      seats: booking.seats,
      startTitle: booking.start_title,
      endTitle: booking.end_title,
      tripDate: booking.trip_date,
      departureTime: booking.departure_time,
    };
  });
}
