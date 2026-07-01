/**
 * Машины водителя: список, добавление.
 * Вынесено из монолитного repo.ts (issue #289).
 *
 * ВНИМАНИЕ: listCarsByDriver и createCar (tgUserId-обёртки) удалены как мёртвый
 * код (issue #289) — 0 внешних вызовов на момент рефакторинга. *ById-варианты
 * (мост сессии, issue #258) — единственные используемые точки входа.
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';

export interface Car {
  id: number;
  model: string;
  color: string | null;
  plate: string | null;
}

/** Авто водителя по внутреннему users.id (мост сессии, issue #258). */
export async function listCarsByDriverId(driverId: number): Promise<Car[]> {
  await ensureReady();
  const res = await getPool().query<Car>(
    `SELECT c.id, c.model, c.color, c.plate
     FROM cars c
     WHERE c.driver_id = $1
     ORDER BY c.id DESC`,
    [driverId],
  );
  return res.rows;
}

export interface CreateCarParams {
  tgDriverId: number;
  model: string;
  color?: string | null;
  plate?: string | null;
}

/** Добавить машину по внутреннему users.id водителя (мост сессии, issue #258). */
export async function createCarById(
  driverId: number,
  params: { model: string; color?: string | null; plate?: string | null },
): Promise<Car> {
  await ensureReady();
  return withTransaction(async (client): Promise<Car> => {
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
