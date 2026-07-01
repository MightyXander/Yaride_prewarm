/**
 * Поездки: поиск по коридору/окну, карточка поездки, справочник точек,
 * история поездок пользователя (водитель + пассажир).
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool } from '../db.ts';
import { todayISO, nowHHMM } from '../seed.ts';
import { internalUserIdByTg } from './_shared.ts';

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
  is_own: boolean;
  already_booked: boolean;
  car_model: string | null;
  car_color: string | null;
  plate: string | null;
}

export interface TripCard extends TripListItem {
  comment: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  driver_username: string | null;
  driver_created_at: string;
  driver_tg_user_id: number;
  /** Телефон водителя — раскрывается пассажиру с активной бронью (тот же accessCond, что и plate), иначе NULL. */
  driver_phone: string | null;
  /** true — у водителя есть телефон, но он скрыт (нет активной брони). UI показывает locked-подпись. */
  driver_phone_locked?: boolean;
}

export interface FindTripsParams {
  startPointId?: number;
  endPointId?: number;
  timeSlot?: TimeSlot;
  /** Дата YYYY-MM-DD; по умолчанию — сегодня. */
  tripDate?: string;
  limit?: number;
  /** Внутренний user.id для определения is_own (опционально). */
  currentUserId?: number;
}

function buildTripListSelect(currentUserId?: number): string {
  const isOwnExpr = currentUserId !== undefined
    ? `(t.driver_id = ${currentUserId}) AS is_own`
    : `false AS is_own`;

  // Активная бронь текущего пользователя на эту поездку — для блокировки
  // повторного бронирования в UI (по аналогии с is_own).
  const alreadyBookedExpr = currentUserId !== undefined
    ? `EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.trip_id = t.id AND b.passenger_id = ${currentUserId} AND b.status = 'active'
       ) AS already_booked`
    : `false AS already_booked`;

  return `
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
    u.license_status AS driver_license_status,
    t.car_model,
    t.car_color,
    -- Госномер в фиде НЕ раскрываем: «доверенный контур» — номер виден только
    -- после подтверждения брони (в деталях поездки). Здесь всегда NULL.
    NULL AS plate,
    ${isOwnExpr},
    ${alreadyBookedExpr}
  FROM trips t
  JOIN route_points sp ON sp.id = t.start_point_id
  JOIN route_points ep ON ep.id = t.end_point_id
  JOIN users u ON u.id = t.driver_id
`;
}

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

  const selectPart = buildTripListSelect(params.currentUserId);
  let query = `${selectPart}
    WHERE t.status = 'open'
      AND t.trip_date = $1
      AND (t.seats_total - t.seats_booked) > 0`;
  const args: (string | number)[] = [tripDate];

  // Не показываем в коридоре поездки, чьё время выезда уже прошло: для поездок
  // сегодняшней даты требуем departure_time >= текущего времени. departure_time —
  // TEXT 'HH:MM' с ведущими нулями → лексикографическое сравнение совпадает с
  // хронологическим. Проверку «сегодня» делаем в JS (todayISO), чтобы не сравнивать
  // TEXT-колонку trip_date с date: в Postgres нет оператора text <> date, и такой
  // предикат ронял /api/trips в 500 (regression PR #288). И todayISO(), и nowHHMM()
  // берут одну серверную локальную зону — сдвиг согласован.
  if (tripDate === todayISO()) {
    args.push(nowHHMM());
    query += ` AND t.departure_time >= $${args.length}`;
  }

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
export async function getTripCard(tripId: number, currentUserId?: number): Promise<TripCard | null> {
  await ensureReady();
  const isOwnExpr = currentUserId !== undefined
    ? `(t.driver_id = ${currentUserId}) AS is_own`
    : `false AS is_own`;

  // Активная бронь текущего пользователя на эту поездку — для блокировки
  // повторного бронирования в UI (по аналогии с is_own).
  const alreadyBookedExpr = currentUserId !== undefined
    ? `EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.trip_id = t.id AND b.passenger_id = ${currentUserId} AND b.status = 'active'
       ) AS already_booked`
    : `false AS already_booked`;

  // «Доверенный контур»: реальный госномер виден только водителю поездки ИЛИ
  // пассажиру с активной бронью. Остальным — NULL + флаг plate_locked, чтобы UI
  // показал бэйдж с серой цензурой («откроется после бронирования»), а не пустоту.
  const accessCond = currentUserId !== undefined
    ? `(t.driver_id = ${currentUserId} OR EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.trip_id = t.id AND b.passenger_id = ${currentUserId} AND b.status = 'active'
       ))`
    : `false`;

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
      t.car_model,
      t.car_color,
      CASE WHEN ${accessCond} THEN t.plate ELSE NULL END AS plate,
      (t.plate IS NOT NULL AND NOT ${accessCond}) AS plate_locked,
      -- Телефон водителя — тот же «доверенный контур», что и госномер: реальный
      -- номер виден водителю поездки ИЛИ пассажиру с активной бронью; остальным
      -- NULL + флаг driver_phone_locked для мягкой подписи в UI.
      CASE WHEN ${accessCond} THEN u.phone ELSE NULL END AS driver_phone,
      (u.phone IS NOT NULL AND NOT ${accessCond}) AS driver_phone_locked,
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
      u.created_at AS driver_created_at,
      u.tg_user_id AS driver_tg_user_id,
      ${isOwnExpr},
      ${alreadyBookedExpr}
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
    admin_area: string;
    title: string;
    kind: string;
    latitude: number | null;
    longitude: number | null;
  }>
> {
  await ensureReady();
  const res = await getPool().query<{
    id: number;
    locality: string;
    district: string;
    admin_area: string;
    title: string;
    kind: string;
    latitude: number | null;
    longitude: number | null;
  }>(
    'SELECT id, locality, district, admin_area, title, kind, latitude, longitude FROM route_points ORDER BY id ASC',
  );
  return res.rows;
}

export interface UserTripItem {
  trip_id: number;
  role: 'driver' | 'passenger';
  trip_date: string;
  departure_time: string;
  time_slot: TimeSlot;
  start_title: string;
  end_title: string;
  price_rub: number;
  seats_total: number;
  seats_booked: number;
  trip_status: string;
  booking_id: number | null;
  booking_status: string | null;
  passenger_seats: number | null;
}

export type TripStatusFilter = 'upcoming' | 'past';

/**
 * Список поездок пользователя (как водителя + как пассажира) для GET /api/me/trips.
 * status='upcoming' — поездки с trip_date >= сегодня, status='open'/'active'.
 * status='past' — trip_date < сегодня ИЛИ завершённые (cancelled/completed).
 */
export async function getUserTrips(
  tgUserId: number,
  statusFilter: TripStatusFilter,
): Promise<UserTripItem[]> {
  const internalId = await internalUserIdByTg(tgUserId);
  return internalId === null ? [] : getUserTripsById(internalId, statusFilter);
}

/** Поездки пользователя по внутреннему users.id (мост сессии, issue #258). */
export async function getUserTripsById(
  internalId: number,
  statusFilter: TripStatusFilter,
): Promise<UserTripItem[]> {
  await ensureReady();

  const today = todayISO();

  // Поездки где пользователь — водитель
  const driverQuery =
    statusFilter === 'upcoming'
      ? `SELECT t.id AS trip_id, 'driver' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                NULL::INTEGER AS booking_id, NULL::TEXT AS booking_status,
                NULL::INTEGER AS passenger_seats, NULL::INTEGER AS driver_id
         FROM trips t
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE t.driver_id = $1 AND t.trip_date >= $2 AND t.status = 'open'`
      : `SELECT t.id AS trip_id, 'driver' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                NULL::INTEGER AS booking_id, NULL::TEXT AS booking_status,
                NULL::INTEGER AS passenger_seats, NULL::INTEGER AS driver_id
         FROM trips t
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE t.driver_id = $1 AND (t.trip_date < $2 OR t.status IN ('cancelled', 'completed'))`;

  // Поездки где пользователь — пассажир
  const passengerQuery =
    statusFilter === 'upcoming'
      ? `SELECT t.id AS trip_id, 'passenger' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                b.id AS booking_id, b.status AS booking_status, b.seats AS passenger_seats,
                t.driver_id
         FROM bookings b
         JOIN trips t ON t.id = b.trip_id
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE b.passenger_id = $1 AND b.status = 'active' AND t.trip_date >= $2 AND t.status = 'open'`
      : `SELECT t.id AS trip_id, 'passenger' AS role, t.trip_date, t.departure_time,
                t.time_slot, sp.title AS start_title, ep.title AS end_title,
                t.price_rub, t.seats_total, t.seats_booked, t.status AS trip_status,
                b.id AS booking_id, b.status AS booking_status, b.seats AS passenger_seats,
                t.driver_id
         FROM bookings b
         JOIN trips t ON t.id = b.trip_id
         JOIN route_points sp ON sp.id = t.start_point_id
         JOIN route_points ep ON ep.id = t.end_point_id
         WHERE b.passenger_id = $1 AND (t.trip_date < $2 OR b.status IN ('cancelled_by_passenger', 'cancelled_by_driver') OR t.status IN ('cancelled', 'completed'))`;

  const unionQuery = `
    (${driverQuery})
    UNION ALL
    (${passengerQuery})
    ORDER BY trip_date DESC, departure_time DESC
  `;

  const res = await getPool().query<UserTripItem>(unionQuery, [internalId, today]);
  return res.rows;
}
