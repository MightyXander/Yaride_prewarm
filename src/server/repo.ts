/**
 * Repo-слой доступа к данным (по образцу MightyXander/Yaride app/repo.py).
 *
 * Под MVP «Один туннель»: список поездок по коридору/окну на дату, карточка поездки
 * с профилем водителя, создание брони с защитой от гонок за места (BEGIN IMMEDIATE-аналог
 * — single transaction better-sqlite3). Эти функции потребуются API в следующем issue.
 */

import type Database from 'better-sqlite3';

import { getDb } from './db.ts';
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
export function findOpenTrips(params: FindTripsParams = {}): TripListItem[] {
  const db = getDb();
  const tripDate = params.tripDate ?? todayISO();
  const limit = params.limit ?? 25;

  let query = `${TRIP_LIST_SELECT}
    WHERE t.status = 'open'
      AND t.trip_date = ?
      AND (t.seats_total - t.seats_booked) > 0`;
  const args: (string | number)[] = [tripDate];

  if (params.startPointId !== undefined) {
    query += ' AND t.start_point_id = ?';
    args.push(params.startPointId);
  }
  if (params.endPointId !== undefined) {
    query += ' AND t.end_point_id = ?';
    args.push(params.endPointId);
  }
  if (params.timeSlot !== undefined) {
    query += ' AND t.time_slot = ?';
    args.push(params.timeSlot);
  }

  query += ' ORDER BY t.departure_time ASC, t.id ASC LIMIT ?';
  args.push(limit);

  return db.prepare(query).all(...args) as TripListItem[];
}

/** Карточка поездки по id с профилем водителя и координатами точек (или null). */
export function getTripCard(tripId: number): TripCard | null {
  const db = getDb();
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
    WHERE t.id = ?
  `;
  const row = db.prepare(query).get(tripId) as TripCard | undefined;
  return row ?? null;
}

/** Все точки коридора (справочник route_points). */
export function listRoutePoints(): Array<{
  id: number;
  locality: string;
  district: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
}> {
  const db = getDb();
  return db
    .prepare(
      'SELECT id, locality, district, title, latitude, longitude FROM route_points ORDER BY id ASC',
    )
    .all() as Array<{
    id: number;
    locality: string;
    district: string;
    title: string;
    latitude: number | null;
    longitude: number | null;
  }>;
}

/** Получить внутренний user.id по telegram-id (или null). */
function getInternalUserId(db: Database.Database, tgUserId: number): number | null {
  const row = db
    .prepare('SELECT id FROM users WHERE tg_user_id = ?')
    .get(tgUserId) as { id: number } | undefined;
  return row ? row.id : null;
}

/**
 * Создать бронь места на поездке для пассажира (по telegram-id).
 *
 * Атомарно в одной транзакции: проверка доступности → UPDATE seats_booked с условием
 * seats_booked < seats_total (защита от двойной брони последнего места) → INSERT booking.
 * Бросает Error с понятным текстом при недоступности.
 */
export function createBooking(
  tgPassengerId: number,
  tripId: number,
  seats = 1,
): BookingResult {
  const db = getDb();

  const run = db.transaction((): BookingResult => {
    const passengerId = getInternalUserId(db, tgPassengerId);
    if (passengerId === null) {
      throw new Error('Профиль пассажира не найден.');
    }

    const trip = db
      .prepare(
        `SELECT t.id, t.status, t.seats_total, t.seats_booked, t.driver_id,
                d.tg_user_id AS driver_tg_user_id
         FROM trips t JOIN users d ON d.id = t.driver_id
         WHERE t.id = ?`,
      )
      .get(tripId) as
      | {
          id: number;
          status: string;
          seats_total: number;
          seats_booked: number;
          driver_id: number;
          driver_tg_user_id: number;
        }
      | undefined;

    if (!trip) {
      throw new Error('Поездка не найдена.');
    }
    if (trip.status !== 'open') {
      throw new Error('Поездка недоступна.');
    }
    if (trip.driver_tg_user_id === tgPassengerId) {
      throw new Error('Нельзя бронировать свою поездку.');
    }

    const existing = db
      .prepare('SELECT id, status FROM bookings WHERE trip_id = ? AND passenger_id = ?')
      .get(tripId, passengerId) as { id: number; status: string } | undefined;
    if (existing && existing.status === 'active') {
      throw new Error('Вы уже забронировали эту поездку.');
    }

    // Захватить места: условие в WHERE гарантирует, что не уйдём в минус.
    const upd = db
      .prepare(
        `UPDATE trips SET seats_booked = seats_booked + ?
         WHERE id = ? AND status = 'open' AND seats_booked + ? <= seats_total`,
      )
      .run(seats, tripId, seats);
    if (upd.changes !== 1) {
      throw new Error('Свободных мест нет.');
    }

    let bookingId: number;
    if (existing) {
      db.prepare(
        `UPDATE bookings
         SET status = 'active', seats = ?, cancel_reason = NULL, cancelled_at = NULL,
             created_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(seats, existing.id);
      bookingId = existing.id;
    } else {
      const info = db
        .prepare('INSERT INTO bookings(trip_id, passenger_id, seats) VALUES (?, ?, ?)')
        .run(tripId, passengerId, seats);
      bookingId = Number(info.lastInsertRowid);
    }

    const after = db
      .prepare('SELECT seats_total - seats_booked AS avail FROM trips WHERE id = ?')
      .get(tripId) as { avail: number };

    return { bookingId, tripId, seatsAvailable: after.avail };
  });

  return run();
}
