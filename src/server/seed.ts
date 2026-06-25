/**
 * Сид при первом старте: коридор «Брагино ↔ Центр», несколько водителей
 * и рыба-поездки на сегодня (утро 7:30–8:40 / вечер 17:30–19:00, SPEC §1).
 *
 * Идемпотентно: сидим только если route_points пуст (свежая БД). Поездки
 * привязываются к текущей дате (today), чтобы вход «список на сегодня» был непустым.
 */

import type Database from 'better-sqlite3';

/** Текущая дата в формате YYYY-MM-DD (локальная зона сервера). */
export function todayISO(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  },
];

/** Засеять коридор/водителей/поездки, если БД ещё пуста (route_points). */
export function seedIfEmpty(db: Database.Database): void {
  const existing = db
    .prepare('SELECT COUNT(*) AS cnt FROM route_points')
    .get() as { cnt: number };
  if (existing.cnt > 0) {
    return;
  }

  const tx = db.transaction(() => {
    const insertPoint = db.prepare(
      `INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind)
       VALUES (?, ?, '', ?, ?, ?, 'stop')`,
    );
    const pointIdByTitle = new Map<string, number>();
    for (const p of SEED_POINTS) {
      const info = insertPoint.run(
        p.locality,
        p.district,
        p.title,
        p.latitude,
        p.longitude,
      );
      pointIdByTitle.set(p.title, Number(info.lastInsertRowid));
    }

    const insertUser = db.prepare(
      `INSERT INTO users(tg_user_id, name, username, age, rating_avg, rating_count,
                         trips_driver_count, license_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const driverIds: number[] = [];
    for (const d of SEED_DRIVERS) {
      const info = insertUser.run(
        d.tgUserId,
        d.name,
        d.username,
        d.age,
        d.ratingAvg,
        d.ratingCount,
        d.tripsDriverCount,
        d.licenseStatus,
      );
      driverIds.push(Number(info.lastInsertRowid));
    }

    const date = todayISO();
    const insertTrip = db.prepare(
      `INSERT INTO trips(driver_id, start_point_id, end_point_id, trip_date,
                         departure_time, time_slot, price_rub, seats_total, comment, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    );
    for (const t of SEED_TRIPS) {
      const startId = pointIdByTitle.get(t.fromTitle);
      const endId = pointIdByTitle.get(t.toTitle);
      if (startId === undefined || endId === undefined) {
        continue;
      }
      insertTrip.run(
        driverIds[t.driverIndex],
        startId,
        endId,
        date,
        t.departureTime,
        t.timeSlot,
        t.priceRub,
        t.seatsTotal,
        t.comment,
      );
    }

    // Шаблон для постоянного водителя (SPEC экран 24 «домой как вчера»).
    db.prepare(
      `INSERT INTO trip_templates(driver_id, start_point_id, end_point_id, time_slot,
                                  price_rub, seats_total, comment)
       VALUES (?, ?, ?, 'evening', ?, ?, ?)`,
    ).run(
      driverIds[0],
      pointIdByTitle.get('Центр'),
      pointIdByTitle.get('Брагино'),
      120,
      3,
      'Домой как обычно',
    );
  });

  tx();
}
