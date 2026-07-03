/**
 * SMS-подтверждение номера (issue #328): коды подтверждения телефона.
 * Хэши кодов (sha256, считается в api.ts), не сами коды. Вынесено в отдельный
 * доменный модуль по конвенции разбиения repo.ts (issue #289).
 */

import { ensureReady, getPool } from '../db.ts';

export interface PhoneVerificationCode {
  id: number;
  user_id: number;
  phone: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  created_at: Date;
}

/** Последний выпущенный код подтверждения для пользователя (троттлинг/проверка). */
export async function getLatestPhoneVerificationCode(
  userId: number,
): Promise<PhoneVerificationCode | null> {
  await ensureReady();
  const res = await getPool().query<PhoneVerificationCode>(
    `SELECT id, user_id, phone, code_hash, expires_at, attempts, created_at
       FROM phone_verification_codes
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId],
  );
  return res.rows[0] ?? null;
}

/**
 * Выпустить новый код подтверждения: старые коды пользователя удаляются
 * (одна активная попытка верификации за раз), затем вставляется новая строка
 * с attempts=0.
 */
export async function createPhoneVerificationCode(
  userId: number,
  phone: string,
  codeHash: string,
  expiresAt: Date,
): Promise<void> {
  await ensureReady();
  const pool = getPool();
  await pool.query('DELETE FROM phone_verification_codes WHERE user_id = $1', [userId]);
  await pool.query(
    `INSERT INTO phone_verification_codes(user_id, phone, code_hash, expires_at, attempts)
     VALUES ($1, $2, $3, $4, 0)`,
    [userId, phone, codeHash, expiresAt],
  );
}

/** Увеличить счётчик неудачных попыток ввода кода на 1. Возвращает новое значение. */
export async function incrementPhoneVerificationAttempts(codeId: number): Promise<number> {
  await ensureReady();
  const res = await getPool().query<{ attempts: number }>(
    'UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
    [codeId],
  );
  return res.rows[0]?.attempts ?? 0;
}

/** Отметить телефон пользователя подтверждённым и удалить использованный код. */
export async function markPhoneVerified(userId: number, codeId: number): Promise<void> {
  await ensureReady();
  const pool = getPool();
  await pool.query(
    'UPDATE users SET phone_verified = true, phone_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
    [userId],
  );
  await pool.query('DELETE FROM phone_verification_codes WHERE id = $1', [codeId]);
}

/** Статус верификации телефона пользователя (для GET /me/phone). */
export async function getUserPhoneVerified(userId: number): Promise<boolean> {
  await ensureReady();
  const res = await getPool().query<{ phone_verified: boolean }>(
    'SELECT phone_verified FROM users WHERE id = $1',
    [userId],
  );
  return res.rows[0]?.phone_verified ?? false;
}
