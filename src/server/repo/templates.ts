/**
 * Шаблоны поездок водителя: список, публикация поездки из шаблона,
 * идемпотентное получение/создание дефолтного шаблона коридора.
 * Вынесено из монолитного repo.ts (issue #289).
 *
 * ВНИМАНИЕ: createTripFromTemplate и getOrCreateDriverTemplate (tgUserId-обёртки)
 * удалены как мёртвый код (issue #289) — 0 внешних вызовов на момент рефакторинга.
 * *ById-варианты (мост сессии, issue #258) — единственные используемые точки входа.
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';
import { recomputeUserTripCounters } from './_shared.ts';
import type { TimeSlot } from './trips.ts';

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

/** Публикация поездки по внутреннему users.id водителя (мост сессии, issue #258). */
export async function createTripFromTemplateById(
  driverId: number,
  params: Omit<PublishTripParams, 'tgDriverId'>,
): Promise<PublishTripResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<PublishTripResult> => {
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

    // Денормализованный счётчик водителя — пересчёт из источника.
    await recomputeUserTripCounters(client, driverId);

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

/**
 * Получить или создать trip_template водителя для коридора Брагино↔Центр.
 * Идемпотентно: если шаблон уже есть — вернуть существующий, иначе создать дефолтный
 * (morning, price_rub=120, seats_total=3). Бросает Error если профиль водителя
 * не найден или точки коридора отсутствуют.
 */
export async function getOrCreateDriverTemplateById(
  driverId: number,
): Promise<TripTemplate> {
  await ensureReady();

  return withTransaction(async (client): Promise<TripTemplate> => {
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
