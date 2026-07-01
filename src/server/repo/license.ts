/**
 * Модерация водительского удостоверения (ВУ): заявка водителя, очередь для
 * админа, решение (одобрить/отклонить).
 * Вынесено из монолитного repo.ts (issue #289).
 *
 * ВНИМАНИЕ: submitLicenseRequest (tgUserId-обёртка) удалена как мёртвый код
 * (issue #289) — 0 внешних вызовов на момент рефакторинга. submitLicenseRequestById
 * (мост сессии, issue #258) — единственная используемая точка входа.
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';

/**
 * Последняя заявка ВУ водителя (для статусного экрана «Заявка водителя»).
 * Возвращает серию/номер и срок действия из license_requests; null — заявок нет.
 */
export async function getLatestLicenseRequest(
  driverId: number,
): Promise<{ series_number: string; valid_until: string } | null> {
  await ensureReady();
  const res = await getPool().query<{ series_number: string; valid_until: string }>(
    `SELECT series_number, valid_until
     FROM license_requests
     WHERE driver_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [driverId],
  );
  return res.rows[0] ?? null;
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

/** Заявка на ВУ по внутреннему users.id (мост сессии, issue #258). */
export async function submitLicenseRequestById(
  driverId: number,
  seriesNumber: string,
  validUntil: string,
): Promise<SubmitLicenseResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<SubmitLicenseResult> => {
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
        [seriesNumber, validUntil, existingRes.rows[0].id],
      );
      requestId = upd.rows[0].id;
    } else {
      // Создать новую заявку
      const ins = await client.query<{ id: number }>(
        `INSERT INTO license_requests(driver_id, series_number, valid_until, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [driverId, seriesNumber, validUntil],
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

export interface PendingLicenseRequest {
  requestId: number;
  driverTgUserId: number;
  driverName: string;
  driverUsername: string | null;
  seriesNumber: string;
  validUntil: string;
  createdAt: string;
}

/**
 * Список всех заявок на проверку ВУ в статусе pending (для админ-очереди в боте).
 * Джойнит данные водителя (имя, username, telegram-id). Сортировка — старые сверху,
 * чтобы админ обрабатывал в порядке поступления. created_at форматируется в SQL,
 * чтобы не зависеть от таймзоны/локали Node.
 */
export async function listPendingLicenseRequests(): Promise<PendingLicenseRequest[]> {
  await ensureReady();
  const res = await getPool().query<{
    request_id: number;
    tg_user_id: number;
    name: string;
    username: string | null;
    series_number: string;
    valid_until: string;
    created_at: string;
  }>(
    `SELECT lr.id AS request_id,
            u.tg_user_id,
            u.name,
            u.username,
            lr.series_number,
            lr.valid_until,
            to_char(lr.created_at, 'DD.MM.YYYY HH24:MI') AS created_at
     FROM license_requests lr
     JOIN users u ON u.id = lr.driver_id
     WHERE lr.status = 'pending'
     ORDER BY lr.created_at ASC`,
  );
  return res.rows.map((r) => ({
    requestId: r.request_id,
    driverTgUserId: r.tg_user_id,
    driverName: r.name,
    driverUsername: r.username,
    seriesNumber: r.series_number,
    validUntil: r.valid_until,
    createdAt: r.created_at,
  }));
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
