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
  is_own: boolean;
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
  /** Внутренний user.id для определения is_own (опционально). */
  currentUserId?: number;
}

function buildTripListSelect(currentUserId?: number): string {
  const isOwnExpr = currentUserId !== undefined
    ? `(t.driver_id = ${currentUserId}) AS is_own`
    : `false AS is_own`;

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
    t.plate,
    ${isOwnExpr}
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
      t.plate,
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
      ${isOwnExpr}
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

export interface EnsureUserParams {
  tgUserId: number;
  name: string;
  username?: string | null;
  age?: number | null;
}

export interface UserRecord {
  id: number;
  tg_user_id: number;
  name: string;
  username: string | null;
  age: number | null;
}

/**
 * JIT-профиль: резолв пользователя по telegram_id, создание при первом
 * обращении (имя из Telegram initData). Идемпотентно через ON CONFLICT.
 * Имя/username обновляются на актуальные из initData; возраст не перетираем.
 */
export async function ensureUser(params: EnsureUserParams): Promise<UserRecord> {
  await ensureReady();
  const name = params.name.trim() || 'Пассажир';
  const username = params.username?.trim() || null;
  const age = params.age ?? null;

  const res = await getPool().query<UserRecord>(
    `INSERT INTO users(tg_user_id, name, username, age)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tg_user_id) DO UPDATE
       SET name = EXCLUDED.name,
           username = COALESCE(EXCLUDED.username, users.username),
           age = COALESCE(users.age, EXCLUDED.age)
     RETURNING id, tg_user_id, name, username, age`,
    [params.tgUserId, name, username, age],
  );
  return res.rows[0];
}

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

/**
 * Подписка route_alerts на коридор/дату (пустой поиск → «позовём, когда появится»).
 * Пассажир резолвится по telegram-id (должен существовать — создаётся JIT в API
 * до вызова). Точки маршрута проверяются на существование (FK + явная проверка).
 * Бросает Error при отсутствии профиля/точек.
 */
export async function createRouteAlert(
  params: RouteAlertParams,
): Promise<RouteAlertResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<RouteAlertResult> => {
    const passengerId = await getInternalUserId(client, params.tgPassengerId);
    if (passengerId === null) {
      throw new Error('Профиль пассажира не найден.');
    }

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

export interface TripTemplate {
  id: number;
  driver_id: number;
  start_point_id: number;
  end_point_id: number;
  time_slot: TimeSlot;
  price_rub: number;
  seats_total: number;
  comment: string | null;
  car_color: string | null;
  plate: string | null;
}

/** Шаблоны поездок водителя (по telegram-id). Пусто, если профиля/шаблонов нет. */
export async function listTripTemplates(
  tgDriverId: number,
): Promise<TripTemplate[]> {
  await ensureReady();
  const res = await getPool().query<TripTemplate>(
    `SELECT tt.id, tt.driver_id, tt.start_point_id, tt.end_point_id,
            tt.time_slot, tt.price_rub, tt.seats_total, tt.comment,
            tt.car_color, tt.plate
     FROM trip_templates tt
     JOIN users u ON u.id = tt.driver_id
     WHERE u.tg_user_id = $1
     ORDER BY tt.id ASC`,
    [tgDriverId],
  );
  return res.rows;
}

export interface PublishTripParams {
  tgDriverId: number;
  templateId: number;
  tripDate: string;
  departureTime: string;
  reverse?: boolean;
  /** Выбранная машина водителя; её модель/цвет/номер пишутся в поездку. */
  carId?: number;
}

export interface PublishTripResult {
  tripId: number;
  driverId: number;
  tripDate: string;
  departureTime: string;
  timeSlot: TimeSlot;
  seatsTotal: number;
  priceRub: number;
}

/**
 * Опубликовать поездку из шаблона водителя (по telegram-id) на дату/время.
 * Шаблон должен принадлежать водителю. Бросает Error при отсутствии профиля/шаблона.
 */
export async function createTripFromTemplate(
  params: PublishTripParams,
): Promise<PublishTripResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<PublishTripResult> => {
    const driverId = await getInternalUserId(client, params.tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    const tplRes = await client.query<TripTemplate>(
      `SELECT id, driver_id, start_point_id, end_point_id, time_slot,
              price_rub, seats_total, comment, car_color, plate
       FROM trip_templates WHERE id = $1 AND driver_id = $2`,
      [params.templateId, driverId],
    );
    const tpl = tplRes.rows[0];
    if (!tpl) {
      throw new Error('Шаблон поездки не найден.');
    }

    // Если reverse=true, меняем местами точки старта/финиша
    const startPointId = params.reverse ? tpl.end_point_id : tpl.start_point_id;
    const endPointId = params.reverse ? tpl.start_point_id : tpl.end_point_id;

    // Вычислить time_slot из departureTime (час < 12 → morning, иначе evening)
    const departureHour = Number.parseInt(params.departureTime.split(':')[0], 10);
    const timeSlot: TimeSlot = departureHour < 12 ? 'morning' : 'evening';

    // Машина поездки: из выбранной (carId) — иначе данные машины из шаблона.
    let carModel: string | null = null;
    let carColor: string | null = tpl.car_color;
    let carPlate: string | null = tpl.plate;
    if (params.carId !== undefined) {
      const carRes = await client.query<{
        model: string;
        color: string | null;
        plate: string | null;
      }>(
        'SELECT model, color, plate FROM cars WHERE id = $1 AND driver_id = $2',
        [params.carId, driverId],
      );
      const car = carRes.rows[0];
      if (!car) {
        throw new Error('Машина не найдена.');
      }
      carModel = car.model;
      carColor = car.color;
      carPlate = car.plate;
    }

    const ins = await client.query<{ id: number }>(
      `INSERT INTO trips(driver_id, start_point_id, end_point_id, trip_date,
                         departure_time, time_slot, price_rub, seats_total,
                         comment, car_model, car_color, plate, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'open')
       RETURNING id`,
      [
        driverId,
        startPointId,
        endPointId,
        params.tripDate,
        params.departureTime,
        timeSlot,
        tpl.price_rub,
        tpl.seats_total,
        tpl.comment,
        carModel,
        carColor,
        carPlate,
      ],
    );

    return {
      tripId: ins.rows[0].id,
      driverId,
      tripDate: params.tripDate,
      departureTime: params.departureTime,
      timeSlot,
      seatsTotal: tpl.seats_total,
      priceRub: tpl.price_rub,
    };
  });
}

export interface Car {
  id: number;
  model: string;
  color: string | null;
  plate: string | null;
}

/** Машины водителя (по telegram-id), новые сверху. Пусто, если профиля/машин нет. */
export async function listCarsByDriver(tgDriverId: number): Promise<Car[]> {
  await ensureReady();
  const res = await getPool().query<Car>(
    `SELECT c.id, c.model, c.color, c.plate
     FROM cars c
     JOIN users u ON u.id = c.driver_id
     WHERE u.tg_user_id = $1
     ORDER BY c.id DESC`,
    [tgDriverId],
  );
  return res.rows;
}

export interface CreateCarParams {
  tgDriverId: number;
  model: string;
  color?: string | null;
  plate?: string | null;
}

/** Добавить машину водителю (по telegram-id). Профиль создаётся JIT в API до вызова. */
export async function createCar(params: CreateCarParams): Promise<Car> {
  await ensureReady();
  return withTransaction(async (client): Promise<Car> => {
    const driverId = await getInternalUserId(client, params.tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }
    const ins = await client.query<Car>(
      `INSERT INTO cars(driver_id, model, color, plate)
       VALUES ($1, $2, $3, $4)
       RETURNING id, model, color, plate`,
      [
        driverId,
        params.model.trim(),
        params.color?.trim() || null,
        params.plate?.trim() || null,
      ],
    );
    return ins.rows[0];
  });
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

export interface UserProfile {
  id: number;
  tg_user_id: number;
  name: string;
  username: string | null;
  age: number | null;
  rating_avg: number;
  rating_count: number;
  trips_driver_count: number;
  trips_passenger_count: number;
  license_status: string;
}

/**
 * Профиль пользователя по telegram-id (для GET /api/me/profile).
 * Возвращает null если пользователь не найден.
 */
export async function getUserProfile(tgUserId: number): Promise<UserProfile | null> {
  await ensureReady();
  const res = await getPool().query<UserProfile>(
    `SELECT id, tg_user_id, name, username, age, rating_avg, rating_count,
            trips_driver_count, trips_passenger_count, license_status
     FROM users WHERE tg_user_id = $1`,
    [tgUserId],
  );
  return res.rows[0] ?? null;
}

export interface PublicUserProfile {
  id: number;
  name: string;
  age: number | null;
  trips_count: number;
  rating: number;
  rating_count: number;
  joined_at: string;
  is_driver: boolean;
  license_verified: boolean;
}

/**
 * Публичный профиль пользователя по внутреннему id (для GET /api/users/:id/profile).
 * Возвращает null если пользователь не найден.
 */
export async function getPublicUserProfile(userId: number): Promise<PublicUserProfile | null> {
  await ensureReady();
  const res = await getPool().query<{
    id: number;
    name: string;
    age: number | null;
    trips_driver_count: number;
    trips_passenger_count: number;
    rating_avg: number;
    rating_count: number;
    created_at: string;
    license_status: string;
  }>(
    `SELECT id, name, age, trips_driver_count, trips_passenger_count, rating_avg, rating_count, created_at, license_status
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    trips_count: row.trips_driver_count + row.trips_passenger_count,
    rating: row.rating_avg,
    rating_count: row.rating_count,
    joined_at: row.created_at,
    is_driver: row.trips_driver_count > 0,
    license_verified: row.license_status === 'verified',
  };
}

export interface UserReview {
  author_id: number;
  author_name: string;
  stars: number;
  comment: string | null;
  tags: string | null;
  created_at: string;
}

/**
 * Список отзывов о пользователе (для GET /api/users/:id/reviews).
 * Возвращает отзывы, отсортированные по дате (новые — первыми).
 */
export async function listUserReviews(userId: number): Promise<UserReview[]> {
  await ensureReady();
  const res = await getPool().query<UserReview>(
    `SELECT r.rater_id AS author_id, u.name AS author_name, r.stars, r.comment, r.tags, r.created_at
     FROM ratings r
     JOIN users u ON u.id = r.rater_id
     WHERE r.ratee_id = $1
     ORDER BY r.created_at DESC`,
    [userId],
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
  await ensureReady();

  const userId = await getPool().query<{ id: number }>(
    'SELECT id FROM users WHERE tg_user_id = $1',
    [tgUserId],
  );
  const internalId = userId.rows[0]?.id;
  if (internalId === undefined) {
    return [];
  }

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

export interface CreateRatingParams {
  tgRaterId: number;
  tripId: number;
  rateeId: number;
  stars: number;
  tags?: string | null;
  comment?: string | null;
}

export interface CreateRatingResult {
  ratingId: number;
  tripId: number;
  rateeId: number;
  stars: number;
  rateeNewAvg: number;
  rateeNewCount: number;
}

/**
 * Создать рейтинг после поездки. Оценивающий (rater) — по telegram-id, оцениваемый (ratee)
 * — по внутреннему id. После вставки рейтинга пересчитывается users.rating_avg/rating_count
 * у оцениваемого. UNIQUE(trip_id, rater_id, ratee_id) защищает от дублей.
 * Бросает Error при дублях, несуществующих пользователях/поездках, нарушении диапазона stars.
 */
export async function createRating(
  params: CreateRatingParams,
): Promise<CreateRatingResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CreateRatingResult> => {
    const raterId = await getInternalUserId(client, params.tgRaterId);
    if (raterId === null) {
      throw new Error('Профиль оценивающего не найден.');
    }

    if (params.stars < 1 || params.stars > 5) {
      throw new Error('Оценка должна быть от 1 до 5 звёзд.');
    }

    // Проверить существование trip и ratee
    const tripCheck = await client.query<{ id: number }>(
      'SELECT id FROM trips WHERE id = $1',
      [params.tripId],
    );
    if (tripCheck.rows.length === 0) {
      throw new Error('Поездка не найдена.');
    }

    const rateeCheck = await client.query<{ id: number }>(
      'SELECT id FROM users WHERE id = $1',
      [params.rateeId],
    );
    if (rateeCheck.rows.length === 0) {
      throw new Error('Оцениваемый пользователь не найден.');
    }

    // Вставить рейтинг
    const ins = await client.query<{ id: number }>(
      `INSERT INTO ratings(trip_id, rater_id, ratee_id, stars, tags, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [params.tripId, raterId, params.rateeId, params.stars, params.tags ?? null, params.comment ?? null],
    );

    // Пересчитать агрегаты у ratee
    const aggRes = await client.query<{ avg: number; cnt: number }>(
      `SELECT COALESCE(AVG(stars), 0.0) AS avg, COUNT(*) AS cnt
       FROM ratings WHERE ratee_id = $1`,
      [params.rateeId],
    );
    const newAvg = Number(aggRes.rows[0].avg);
    const newCount = Number(aggRes.rows[0].cnt);

    await client.query(
      'UPDATE users SET rating_avg = $1, rating_count = $2 WHERE id = $3',
      [newAvg, newCount, params.rateeId],
    );

    return {
      ratingId: ins.rows[0].id,
      tripId: params.tripId,
      rateeId: params.rateeId,
      stars: params.stars,
      rateeNewAvg: newAvg,
      rateeNewCount: newCount,
    };
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
}

/**
 * Список броней для поездки (для водителя, GET /api/trips/:id/bookings).
 * Возвращает все брони независимо от статуса.
 */
export async function getTripBookings(tripId: number): Promise<BookingDetail[]> {
  await ensureReady();
  const res = await getPool().query<BookingDetail>(
    `SELECT b.id AS booking_id, b.passenger_id, u.name AS passenger_name,
            u.username AS passenger_username, b.seats, b.status, b.created_at
     FROM bookings b
     JOIN users u ON u.id = b.passenger_id
     WHERE b.trip_id = $1
     ORDER BY b.created_at ASC`,
    [tripId],
  );
  return res.rows;
}

export interface CancelBookingResult {
  bookingId: number;
  tripId: number;
  seatsFreed: number;
  newAvailable: number;
}

/**
 * Отменить бронь водителем (PATCH /api/bookings/:id action='cancel_by_driver').
 * Переводит бронь в status='cancelled_by_driver', освобождает seats в trips.seats_booked.
 * Бросает Error если бронь не найдена или уже отменена.
 */
export async function cancelBookingByDriver(
  bookingId: number,
  tgDriverId: number,
): Promise<CancelBookingResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CancelBookingResult> => {
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
    }>(
      `SELECT b.id, b.trip_id, b.status, b.seats, t.driver_id
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
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

    const availRes = await client.query<{ avail: number }>(
      'SELECT seats_total - seats_booked AS avail FROM trips WHERE id = $1',
      [booking.trip_id],
    );

    return {
      bookingId,
      tripId: booking.trip_id,
      seatsFreed: booking.seats,
      newAvailable: availRes.rows[0].avail,
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
): Promise<{ bookingId: number; tripId: number; passengerName: string; seats: number }> {
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
      passenger_name: string;
    }>(
      `SELECT b.id, b.trip_id, b.status, b.seats, t.driver_id, u.name AS passenger_name
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN users u ON u.id = b.passenger_id
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
    // Можно добавить логирование или дополнительный флаг, но для MVP достаточно проверки
    return {
      bookingId: booking.id,
      tripId: booking.trip_id,
      passengerName: booking.passenger_name,
      seats: booking.seats,
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

/**
 * Получить или создать trip_template водителя для коридора Брагино↔Центр.
 * Идемпотентно: если шаблон уже есть — вернуть существующий, иначе создать дефолтный
 * (morning, price_rub=120, seats_total=3). Бросает Error если профиль водителя
 * не найден или точки коридора отсутствуют.
 */
export async function getOrCreateDriverTemplate(
  tgDriverId: number,
): Promise<TripTemplate> {
  await ensureReady();

  return withTransaction(async (client): Promise<TripTemplate> => {
    const driverId = await getInternalUserId(client, tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    // Получить точки коридора Брагино↔Центр
    const pointsRes = await client.query<{ id: number; title: string }>(
      `SELECT id, title FROM route_points
       WHERE (locality = 'Ярославль' AND district = 'Дзержинский район' AND title = 'Брагино')
          OR (locality = 'Ярославль' AND district = 'Кировский район' AND title = 'Центр')`,
    );
    const pointIdByTitle = new Map<string, number>();
    for (const p of pointsRes.rows) {
      pointIdByTitle.set(p.title, p.id);
    }
    const braginoId = pointIdByTitle.get('Брагино');
    const centrId = pointIdByTitle.get('Центр');
    if (braginoId === undefined || centrId === undefined) {
      throw new Error('Точки коридора Брагино↔Центр не найдены.');
    }

    // Проверить существующие шаблоны водителя для коридора
    const existingRes = await client.query<TripTemplate>(
      `SELECT id, driver_id, start_point_id, end_point_id, time_slot, price_rub, seats_total, comment
       FROM trip_templates
       WHERE driver_id = $1
         AND ((start_point_id = $2 AND end_point_id = $3) OR (start_point_id = $3 AND end_point_id = $2))
       ORDER BY id ASC
       LIMIT 1`,
      [driverId, braginoId, centrId],
    );

    if (existingRes.rows.length > 0) {
      return existingRes.rows[0];
    }

    // Создать дефолтный шаблон: Брагино→Центр, morning, 120 руб, 3 места
    const insertRes = await client.query<TripTemplate>(
      `INSERT INTO trip_templates(driver_id, start_point_id, end_point_id, time_slot, price_rub, seats_total, comment)
       VALUES ($1, $2, $3, 'morning', 120, 3, NULL)
       RETURNING id, driver_id, start_point_id, end_point_id, time_slot, price_rub, seats_total, comment`,
      [driverId, braginoId, centrId],
    );

    return insertRes.rows[0];
  });
}

export interface SubmitLicenseParams {
  tgDriverId: number;
  seriesNumber: string;
  validUntil: string;
}

export interface SubmitLicenseResult {
  requestId: number;
  status: string;
}

/**
 * Отправить заявку на проверку ВУ (W1: модерация).
 * Идемпотентно: повторная заявка обновляет существующую pending, не плодит дубли.
 * Создает license_request(pending) + обновляет users.license_status='pending'.
 * Бросает Error если профиль водителя не найден.
 */
export async function submitLicenseRequest(
  params: SubmitLicenseParams,
): Promise<SubmitLicenseResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<SubmitLicenseResult> => {
    const driverId = await getInternalUserId(client, params.tgDriverId);
    if (driverId === null) {
      throw new Error('Профиль водителя не найден.');
    }

    // Проверить существующую pending-заявку
    const existingRes = await client.query<{ id: number; status: string }>(
      'SELECT id, status FROM license_requests WHERE driver_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [driverId, 'pending'],
    );

    let requestId: number;

    if (existingRes.rows.length > 0) {
      // Обновить существующую pending-заявку
      const upd = await client.query<{ id: number }>(
        `UPDATE license_requests
         SET series_number = $1, valid_until = $2, created_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id`,
        [params.seriesNumber, params.validUntil, existingRes.rows[0].id],
      );
      requestId = upd.rows[0].id;
    } else {
      // Создать новую заявку
      const ins = await client.query<{ id: number }>(
        `INSERT INTO license_requests(driver_id, series_number, valid_until, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [driverId, params.seriesNumber, params.validUntil],
      );
      requestId = ins.rows[0].id;
    }

    // Обновить users.license_status='pending'
    await client.query(
      "UPDATE users SET license_status = 'pending' WHERE id = $1",
      [driverId],
    );

    return { requestId, status: 'pending' };
  });
}

export interface LicenseDecisionResult {
  driverTgUserId: number;
  driverName: string;
  seriesNumber: string;
}

/**
 * Решение по заявке на проверку ВУ (модерация админом).
 * Транзакционно: проверяет, что заявка существует и pending; выставляет
 * license_requests.status (approved|rejected) + reviewer/reviewed_at и
 * users.license_status (verified|rejected). Возвращает данные водителя для пуша.
 * Бросает Error, если заявка не найдена или уже обработана.
 */
async function decideLicenseRequest(
  requestId: number,
  decision: 'approved' | 'rejected',
  reviewer: string,
): Promise<LicenseDecisionResult> {
  await ensureReady();
  const userStatus = decision === 'approved' ? 'verified' : 'rejected';

  return withTransaction(async (client): Promise<LicenseDecisionResult> => {
    const reqRes = await client.query<{
      driver_id: number;
      series_number: string;
      status: string;
    }>(
      'SELECT driver_id, series_number, status FROM license_requests WHERE id = $1 FOR UPDATE',
      [requestId],
    );
    if (reqRes.rows.length === 0) {
      throw new Error('Заявка на проверку ВУ не найдена.');
    }
    const reqRow = reqRes.rows[0];
    if (reqRow.status !== 'pending') {
      throw new Error('Заявка уже обработана.');
    }

    await client.query(
      `UPDATE license_requests
       SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewer = $2
       WHERE id = $3`,
      [decision, reviewer, requestId],
    );

    const userRes = await client.query<{ tg_user_id: number; name: string }>(
      'UPDATE users SET license_status = $1 WHERE id = $2 RETURNING tg_user_id, name',
      [userStatus, reqRow.driver_id],
    );
    const u = userRes.rows[0];

    return {
      driverTgUserId: u.tg_user_id,
      driverName: u.name,
      seriesNumber: reqRow.series_number,
    };
  });
}

/** Одобрить заявку на проверку ВУ → license_status='verified'. */
export async function approveLicenseRequest(
  requestId: number,
  reviewer: string,
): Promise<LicenseDecisionResult> {
  return decideLicenseRequest(requestId, 'approved', reviewer);
}

/** Отклонить заявку на проверку ВУ → license_status='rejected'. */
export async function rejectLicenseRequest(
  requestId: number,
  reviewer: string,
): Promise<LicenseDecisionResult> {
  return decideLicenseRequest(requestId, 'rejected', reviewer);
}

/**
 * Типы уведомлений.
 */
export type NotificationType = 'booking' | 'booking_confirmed' | 'cancel' | 'rate_reminder';

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
 * Получить список уведомлений пользователя (упорядочены по created_at DESC).
 */
export async function listNotifications(userId: number, limit = 50): Promise<NotificationItem[]> {
  await ensureReady();
  const res = await getPool().query<NotificationItem>(
    `SELECT id, type, title, body, read, ref_trip_id, ref_user_id, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return res.rows;
}

/**
 * Пометить уведомление как прочитанное.
 */
export async function markNotificationRead(notificationId: number, userId: number): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query(
    `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
    [notificationId, userId],
  );
  return res.rowCount !== null && res.rowCount > 0;
}
