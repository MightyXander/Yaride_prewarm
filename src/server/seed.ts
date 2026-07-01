/**
 * Сид при первом старте: коридор «Брагино ↔ Центр», несколько водителей
 * и рыба-поездки на сегодня (утро 7:30–8:40 / вечер 17:30–19:00, SPEC §1).
 *
 * Идемпотентно: сидим только если route_points пуст (свежая БД). Поездки
 * привязываются к текущей дате (today), чтобы вход «список на сегодня» был непустым.
 */

import type { Pool } from 'pg';

/** Текущая дата в формате YYYY-MM-DD (локальная зона сервера). */
export function todayISO(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Текущее время в формате HH:MM (локальная зона сервера, как и todayISO). */
export function nowHHMM(d: Date = new Date()): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

interface SeedPoint {
  locality: string;
  district: string;
  title: string;
  latitude: number;
  longitude: number;
}

// Коридор MVP «Один туннель»: Брагино (Дзержинский р-н) ↔ Центр (Кировский р-н), Ярославль.
const SEED_POINTS: readonly SeedPoint[] = [
  {
    locality: 'Ярославль',
    district: 'Дзержинский район',
    title: 'Брагино',
    latitude: 57.6855,
    longitude: 39.8267,
  },
  {
    locality: 'Ярославль',
    district: 'Кировский район',
    title: 'Центр',
    latitude: 57.6261,
    longitude: 39.8845,
  },
];

interface SeedDriver {
  tgUserId: number;
  name: string;
  username: string;
  age: number;
  ratingAvg: number;
  ratingCount: number;
  tripsDriverCount: number;
  licenseStatus: string;
}

const SEED_DRIVERS: readonly SeedDriver[] = [
  {
    tgUserId: 900000001,
    name: 'Алексей',
    username: 'alex_brg',
    age: 34,
    ratingAvg: 4.9,
    ratingCount: 58,
    tripsDriverCount: 73,
    licenseStatus: 'verified',
  },
  {
    tgUserId: 900000002,
    name: 'Марина',
    username: 'marina_yar',
    age: 29,
    ratingAvg: 4.8,
    ratingCount: 41,
    tripsDriverCount: 52,
    licenseStatus: 'verified',
  },
  {
    tgUserId: 900000003,
    name: 'Дмитрий',
    username: 'dmitry_d',
    age: 41,
    ratingAvg: 5.0,
    ratingCount: 22,
    tripsDriverCount: 25,
    licenseStatus: 'verified',
  },
];

interface SeedTrip {
  driverIndex: number;
  fromTitle: string;
  toTitle: string;
  timeSlot: 'morning' | 'evening';
  departureTime: string;
  priceRub: number;
  seatsTotal: number;
  comment: string | null;
  carColor: string | null;
  plate: string | null;
}

// Рыба-поездки: утро Брагино→Центр (7:30–8:40), вечер Центр→Брагино (17:30–19:00).
const SEED_TRIPS: readonly SeedTrip[] = [
  {
    driverIndex: 0,
    fromTitle: 'Брагино',
    toTitle: 'Центр',
    timeSlot: 'morning',
    departureTime: '07:30',
    priceRub: 120,
    seatsTotal: 3,
    comment: 'Еду через Ленинградский, могу подобрать по пути',
    carColor: 'белый',
    plate: 'А123ВС',
  },
  {
    driverIndex: 1,
    fromTitle: 'Брагино',
    toTitle: 'Центр',
    timeSlot: 'morning',
    departureTime: '08:00',
    priceRub: 100,
    seatsTotal: 2,
    comment: null,
    carColor: 'серый',
    plate: 'М456КР',
  },
  {
    driverIndex: 2,
    fromTitle: 'Брагино',
    toTitle: 'Центр',
    timeSlot: 'morning',
    departureTime: '08:40',
    priceRub: 120,
    seatsTotal: 4,
    comment: 'Просторная машина, два места у окна',
    carColor: 'белый',
    plate: 'Т789ОН',
  },
  {
    driverIndex: 0,
    fromTitle: 'Центр',
    toTitle: 'Брагино',
    timeSlot: 'evening',
    departureTime: '17:30',
    priceRub: 120,
    seatsTotal: 3,
    comment: 'Домой как обычно',
    carColor: 'белый',
    plate: 'А123ВС',
  },
  {
    driverIndex: 1,
    fromTitle: 'Центр',
    toTitle: 'Брагино',
    timeSlot: 'evening',
    departureTime: '18:15',
    priceRub: 100,
    seatsTotal: 3,
    comment: null,
    carColor: 'серый',
    plate: 'М456КР',
  },
  {
    driverIndex: 2,
    fromTitle: 'Центр',
    toTitle: 'Брагино',
    timeSlot: 'evening',
    departureTime: '19:00',
    priceRub: 120,
    seatsTotal: 2,
    comment: null,
    carColor: 'белый',
    plate: 'Т789ОН',
  },
];

/**
 * Засеять коридор/водителей/поездки, если БД ещё пуста (route_points).
 *
 * Идемпотентно: гард по пустому route_points + INSERT ... ON CONFLICT DO NOTHING
 * на точках/пользователях (естественные ключи uq_route_point и tg_user_id), так
 * что повторный запуск на уже засеянной БД ничего не дублирует. Рыба-trips
 * вставляется только в ветке первичного сида (нет естественного ключа).
 */
export async function seedIfEmpty(pool: Pool): Promise<void> {
  const existing = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM route_points',
  );
  if (Number(existing.rows[0].cnt) > 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pointIdByTitle = new Map<string, number>();
    for (const p of SEED_POINTS) {
      const res = await client.query<{ id: number }>(
        `INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind)
         VALUES ($1, $2, '', $3, $4, $5, 'stop')
         ON CONFLICT (locality, district, admin_area, title) DO NOTHING
         RETURNING id`,
        [p.locality, p.district, p.title, p.latitude, p.longitude],
      );
      let id = res.rows[0]?.id;
      if (id === undefined) {
        const sel = await client.query<{ id: number }>(
          `SELECT id FROM route_points
           WHERE locality = $1 AND district = $2 AND admin_area = '' AND title = $3`,
          [p.locality, p.district, p.title],
        );
        id = sel.rows[0].id;
      }
      pointIdByTitle.set(p.title, id);
    }

    const driverIds: number[] = [];
    for (const d of SEED_DRIVERS) {
      const res = await client.query<{ id: number }>(
        `INSERT INTO users(tg_user_id, name, username, age, rating_avg, rating_count,
                           trips_driver_count, license_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tg_user_id) DO NOTHING
         RETURNING id`,
        [
          d.tgUserId,
          d.name,
          d.username,
          d.age,
          d.ratingAvg,
          d.ratingCount,
          d.tripsDriverCount,
          d.licenseStatus,
        ],
      );
      let id = res.rows[0]?.id;
      if (id === undefined) {
        const sel = await client.query<{ id: number }>(
          'SELECT id FROM users WHERE tg_user_id = $1',
          [d.tgUserId],
        );
        id = sel.rows[0].id;
      }
      driverIds.push(id);
    }

    const date = todayISO();
    for (const t of SEED_TRIPS) {
      const startId = pointIdByTitle.get(t.fromTitle);
      const endId = pointIdByTitle.get(t.toTitle);
      if (startId === undefined || endId === undefined) {
        continue;
      }
      await client.query(
        `INSERT INTO trips(driver_id, start_point_id, end_point_id, trip_date,
                           departure_time, time_slot, price_rub, seats_total, comment,
                           car_color, plate, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
        [
          driverIds[t.driverIndex],
          startId,
          endId,
          date,
          t.departureTime,
          t.timeSlot,
          t.priceRub,
          t.seatsTotal,
          t.comment,
          t.carColor,
          t.plate,
        ],
      );
    }

    // Шаблон для постоянного водителя (SPEC экран 24 «домой как вчера»).
    await client.query(
      `INSERT INTO trip_templates(driver_id, start_point_id, end_point_id, time_slot,
                                  price_rub, seats_total, comment, car_color, plate)
       VALUES ($1, $2, $3, 'evening', $4, $5, $6, $7, $8)`,
      [
        driverIds[0],
        pointIdByTitle.get('Центр'),
        pointIdByTitle.get('Брагино'),
        120,
        3,
        'Домой как обычно',
        'белый',
        'А123ВС',
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Идемпотентный per-day refresh демо-поездок на сегодня.
 *
 * Вызывается на каждом старте (после seedIfEmpty) для гарантии, что демо-коридор
 * населён на текущую дату. Если демо-trips на сегодня уже есть — ничего не делаем
 * (идемпотентно за день). Иначе вставляем демо-коридор утро+вечер Брагино↔Центр
 * по существующим демо-водителям/route_points, status='open', свободные места.
 */
export async function ensureDemoTripsForToday(pool: Pool): Promise<void> {
  const today = todayISO();

  // Получить демо-водителей (по tg_user_id из SEED_DRIVERS)
  const demoTgIds = SEED_DRIVERS.map((d) => d.tgUserId);
  const driverRes = await pool.query<{ id: number; tg_user_id: number }>(
    'SELECT id, tg_user_id FROM users WHERE tg_user_id = ANY($1::bigint[])',
    [demoTgIds],
  );
  if (driverRes.rows.length === 0) {
    // Демо-водители ещё не засеяны (первый старт до seedIfEmpty) — skip
    return;
  }
  const demoDriverIds = driverRes.rows.map((r) => r.id);

  // Проверить, есть ли уже демо-trips на сегодня
  const existingRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM trips
     WHERE trip_date = $1 AND driver_id = ANY($2::int[])`,
    [today, demoDriverIds],
  );
  if (Number(existingRes.rows[0].cnt) > 0) {
    // Демо-trips на сегодня уже есть — идемпотентно
    return;
  }

  // Получить точки маршрута (Брагино, Центр)
  const pointsRes = await pool.query<{ id: number; title: string }>(
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
    // Точки ещё не засеяны (не должно случиться после seedIfEmpty) — skip
    return;
  }

  // Маппинг демо-водителей: tg_user_id → internal id
  const driverIdByTg = new Map<number, number>();
  for (const r of driverRes.rows) {
    driverIdByTg.set(r.tg_user_id, r.id);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Вставить демо-trips на сегодня (по шаблону SEED_TRIPS)
    for (const t of SEED_TRIPS) {
      const driverId = driverIdByTg.get(SEED_DRIVERS[t.driverIndex].tgUserId);
      if (driverId === undefined) {
        continue;
      }
      const startId = pointIdByTitle.get(t.fromTitle);
      const endId = pointIdByTitle.get(t.toTitle);
      if (startId === undefined || endId === undefined) {
        continue;
      }
      await client.query(
        `INSERT INTO trips(driver_id, start_point_id, end_point_id, trip_date,
                           departure_time, time_slot, price_rub, seats_total, comment,
                           car_color, plate, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
        [
          driverId,
          startId,
          endId,
          today,
          t.departureTime,
          t.timeSlot,
          t.priceRub,
          t.seatsTotal,
          t.comment,
          t.carColor,
          t.plate,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
