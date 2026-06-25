/**
 * Repo-слой доступа к данным (по образцу MightyXander/Yaride app/repo.py).
 *
 * PostgreSQL/node-postgres, async. Под MVP «Один туннель»: список поездок по
 * коридору/окну на дату, карточка поездки с профилем водителя, создание брони
 * с защитой от гонок за места (транзакция BEGIN/COMMIT + условный UPDATE ...
 * RETURNING), справочник точек. Эти функции потребуются API в следующем issue.
 */

import type { PoolClient } from 'pg';

import { ensureReady, getPool, withTransaction } from './db.ts';
import { todayISO } from './seed.ts';

export type TimeSlot = 'morning' | 'evening';

export interface TripListItem {
  id: number;
  driver_id: number;
  time_slot: TimeSlot;
  trip_date: string;
  departure_time: string;
  price_rub: number;
  seats_total: number;
  seats_booked: number;
  seats_available: number;
  status: string;
  start_point_id: number;
  end_point_id: number;
  start_title: string;
  end_title: string;
  driver_name: string;
  driver_age: number | null;
  driver_rating: number;
  driver_rating_count: number;
  driver_trips_count: number;
  driver_license_status: string;
}

export interface TripCard extends TripListItem {
  comment: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  driver_username: string | null;
  driver_created_at: string;
}

export interface BookingResult {
  bookingId: number;
  tripId: number;
  seatsAvailable: number;
}

export interface FindTripsParams {
  startPointId?: number;
  endPointId?: number;
  timeSlot?: TimeSlot;
  /** Дата YYYY-MM-DD; по умолчанию — сегодня. */
  tripDate?: string;
  limit?: number;
}

const TRIP_LIST_SELECT = `
  SELECT
    t.id,
    t.driver_id,
    t.time_slot,
    t.trip_date,
    t.departure_time,
    t.price_rub,
    t.seats_total,
    t.seats_booked,
    (t.seats_total - t.seats_booked) AS seats_available,
    t.status,
    t.start_point_id,
    t.end_point_id,
    sp.title AS start_title,
    ep.title AS end_title,
    u.name AS driver_name,
    u.age AS driver_age,
    u.rating_avg AS driver_rating,
    u.rating_count AS driver_rating_count,
    u.trips_driver_count AS driver_trips_count,
    u.license_status AS driver_license_status
  FROM trips t
  JOIN route_points sp ON sp.id = t.start_point_id
  JOIN route_points ep ON ep.id = t.end_point_id
  JOIN users u ON u.id = t.driver_id
`;

/**
 * Поездки по коридору/окну на дату (status='open'), есть свободные места.
 * Любой из фильтров опционален; без startPointId/endPointId — все открытые на дату.
 */
export async function findOpenTrips(
  params: FindTripsParams = {},
): Promise<TripListItem[]> {
  await ensureReady();
  const tripDate = params.tripDate ?? todayISO();
  const limit = params.limit ?? 25;

  let query = `${TRIP_LIST_SELECT}
    WHERE t.status = 'open'
      AND t.trip_date = $1
      AND (t.seats_total - t.seats_booked) > 0`;
  const args: (string | number)[] = [tripDate];

  if (params.startPointId !== undefined) {
    args.push(params.startPointId);
    query += ` AND t.start_point_id = $${args.length}`;
  }
  if (params.endPointId !== undefined) {
    args.push(params.endPointId);
    query += ` AND t.end_point_id = $${args.length}`;
  }
  if (params.timeSlot !== undefined) {
    args.push(params.timeSlot);
    query += ` AND t.time_slot = $${args.length}`;
  }

  args.push(limit);
  query += ` ORDER BY t.departure_time ASC, t.id ASC LIMIT $${args.length}`;

  const res = await getPool().query<TripListItem>(query, args);
  return res.rows;
}

/** Карточка поездки по id с профилем водителя и координатами точек (или null). */
export async function getTripCard(tripId: number): Promise<TripCard | null> {
  await ensureReady();
  const query = `
    SELECT
      t.id,
      t.driver_id,
      t.time_slot,
      t.trip_date,
      t.departure_time,
      t.price_rub,
      t.seats_total,
      t.seats_booked,
      (t.seats_total - t.seats_booked) AS seats_available,
      t.status,
      t.comment,
      t.start_point_id,
      t.end_point_id,
      sp.title AS start_title,
      ep.title AS end_title,
      sp.latitude AS start_lat,
      sp.longitude AS start_lng,
      ep.latitude AS end_lat,
      ep.longitude AS end_lng,
      u.name AS driver_name,
      u.username AS driver_username,
      u.age AS driver_age,
      u.rating_avg AS driver_rating,
      u.rating_count AS driver_rating_count,
      u.trips_driver_count AS driver_trips_count,
      u.license_status AS driver_license_status,
      u.created_at AS driver_created_at
    FROM trips t
    JOIN route_points sp ON sp.id = t.start_point_id
    JOIN route_points ep ON ep.id = t.end_point_id
    JOIN users u ON u.id = t.driver_id
    WHERE t.id = $1
  `;
  const res = await getPool().query<TripCard>(query, [tripId]);
  return res.rows[0] ?? null;
}

/** Все точки коридора (справочник route_points). */
export async function listRoutePoints(): Promise<
  Array<{
    id: number;
    locality: string;
    district: string;
    title: string;
    latitude: number | null;
    longitude: number | null;
  }>
> {
  await ensureReady();
  const res = await getPool().query<{
    id: number;
    locality: string;
    district: string;
    title: string;
    latitude: number | null;
    longitude: number | null;
  }>(
    'SELECT id, locality, district, title, latitude, longitude FROM route_points ORDER BY id ASC',
  );
  return res.rows;
}

/** Получить внутренний user.id по telegram-id (или null). */
async function getInternalUserId(
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
  await ensureReady();

  return withTransaction(async (client): Promise<BookingResult> => {
    const passengerId = await getInternalUserId(client, tgPassengerId);
    if (passengerId === null) {
      throw new Error('Профиль пассажира не найден.');
    }

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
    if (Number(trip.driver_tg_user_id) === tgPassengerId) {
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

    const afterRes = await client.query<{ avail: number }>(
      'SELECT seats_total - seats_booked AS avail FROM trips WHERE id = $1',
      [tripId],
    );

    return { bookingId, tripId, seatsAvailable: afterRes.rows[0].avail };
  });
}
