/**
 * Очередь заявок на изменение личных данных профиля (issue #454).
 *
 * Фундамент для backend (#455), mini-app (#456) и админки (#457). Пользователь
 * после регистрации отправляет частичную дельту личных данных, которая попадает
 * в profile_change_requests со статусом 'pending'; модератор (админка Python)
 * одобряет/отклоняет. Инвариант «один активный pending на пользователя» держит
 * частичный уникальный индекс uq_pcr_pending — новая заявка вытесняет прежнюю
 * необработанную (см. createOrReplacePendingRequest).
 *
 * PostgreSQL/node-postgres. id/user_id — bigint (pg отдаёт их строкой), поэтому
 * маппим в number; timestamptz нормализуем в ISO-строку.
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';

/**
 * Частичная дельта личных данных профиля — payload заявки и параметр
 * updateUserPersonalFields. Все шесть полей опциональны (обновляются только
 * переданные). Общий тип, переиспользуется в repo/users.ts.
 */
export interface ProfilePersonalFields {
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  /** ISO-дата (YYYY-MM-DD) либо null для сброса. */
  birth_date?: string | null;
  sex?: 'male' | 'female' | 'unknown';
}

/** Строка очереди заявок на изменение личных данных. */
export interface ProfileChangeRequest {
  id: number;
  user_id: number;
  payload: ProfilePersonalFields;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewer: string | null;
  reject_reason: string | null;
}

/** Сырой ряд из БД (bigint → строка, timestamptz → Date|строка). */
interface Row {
  id: string;
  user_id: string;
  payload: ProfilePersonalFields;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date | string;
  reviewed_at: Date | string | null;
  reviewer: string | null;
  reject_reason: string | null;
}

const SELECT_COLUMNS =
  'id, user_id, payload, status, created_at, reviewed_at, reviewer, reject_reason';

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: Row): ProfileChangeRequest {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    payload: row.payload,
    status: row.status,
    created_at: toIso(row.created_at) as string,
    reviewed_at: toIso(row.reviewed_at),
    reviewer: row.reviewer,
    reject_reason: row.reject_reason,
  };
}

/**
 * Создать новую pending-заявку, вытеснив прежнюю необработанную того же
 * пользователя. Транзакционно удаляет существующий pending (частичный индекс
 * uq_pcr_pending допускает лишь один) и вставляет новый. Возвращает созданную
 * заявку.
 */
export async function createOrReplacePendingRequest(
  userId: number,
  payload: ProfilePersonalFields,
): Promise<ProfileChangeRequest> {
  await ensureReady();
  return withTransaction(async (client): Promise<ProfileChangeRequest> => {
    await client.query(
      "DELETE FROM profile_change_requests WHERE user_id = $1 AND status = 'pending'",
      [userId],
    );
    const res = await client.query<Row>(
      `INSERT INTO profile_change_requests(user_id, payload)
       VALUES ($1, $2::jsonb)
       RETURNING ${SELECT_COLUMNS}`,
      [userId, JSON.stringify(payload)],
    );
    return mapRow(res.rows[0]);
  });
}

/** Активная (pending) заявка пользователя или null. */
export async function getPendingRequestByUser(
  userId: number,
): Promise<ProfileChangeRequest | null> {
  await ensureReady();
  const res = await getPool().query<Row>(
    `SELECT ${SELECT_COLUMNS} FROM profile_change_requests
     WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/**
 * Все pending-заявки (очередь модерации; сама админка — Python, эта функция для
 * полноты контракта и тестов). Старые сверху — порядок поступления.
 */
export async function listPendingRequests(): Promise<ProfileChangeRequest[]> {
  await ensureReady();
  const res = await getPool().query<Row>(
    `SELECT ${SELECT_COLUMNS} FROM profile_change_requests
     WHERE status = 'pending'
     ORDER BY created_at ASC, id ASC`,
  );
  return res.rows.map(mapRow);
}

/** Заявка по id или null. */
export async function getRequestById(id: number): Promise<ProfileChangeRequest | null> {
  await ensureReady();
  const res = await getPool().query<Row>(
    `SELECT ${SELECT_COLUMNS} FROM profile_change_requests WHERE id = $1`,
    [id],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/**
 * Пометить заявку одобренной (переход только из pending). Возвращает обновлённую
 * заявку или null, если её нет либо она уже обработана.
 */
export async function markApproved(
  id: number,
  reviewer: string,
): Promise<ProfileChangeRequest | null> {
  await ensureReady();
  const res = await getPool().query<Row>(
    `UPDATE profile_change_requests
     SET status = 'approved', reviewed_at = now(), reviewer = $2, reject_reason = NULL
     WHERE id = $1 AND status = 'pending'
     RETURNING ${SELECT_COLUMNS}`,
    [id, reviewer],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/**
 * Пометить заявку отклонённой (переход только из pending) с причиной. Возвращает
 * обновлённую заявку или null, если её нет либо она уже обработана.
 */
export async function markRejected(
  id: number,
  reviewer: string,
  reason: string,
): Promise<ProfileChangeRequest | null> {
  await ensureReady();
  const res = await getPool().query<Row>(
    `UPDATE profile_change_requests
     SET status = 'rejected', reviewed_at = now(), reviewer = $2, reject_reason = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING ${SELECT_COLUMNS}`,
    [id, reviewer, reason],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}
