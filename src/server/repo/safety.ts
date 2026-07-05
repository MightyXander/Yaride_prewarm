/**
 * Настройки безопасности пользователя + доверенный контакт (issue #344, срез 1
 * из #323 — SOS/112, live-шеринг и телефон-блок здесь НЕ реализуются).
 *
 * Одна таблица safety_settings (user_id PK → users) — одна сущность, без
 * JSON-блобов. PUT сохраняет полное состояние (без диффов): экран из трёх
 * тумблеров и одной инлайн-формы контакта не окупает PATCH-семантику.
 */

import { ensureReady, getPool } from '../db.ts';

export interface TrustedContact {
  name: string;
  phone: string;
}

export interface SafetySettings {
  sosEnabled: boolean;
  autoShare: boolean;
  womenOnly: boolean;
  /** null — контакт не задан. */
  trustedContact: TrustedContact | null;
}

/** Дефолты для пользователя без строки в safety_settings (см. контракт GET /api/me/safety). */
const DEFAULT_SAFETY_SETTINGS: SafetySettings = {
  sosEnabled: true,
  autoShare: false,
  womenOnly: true,
  trustedContact: null,
};

/**
 * Настройки безопасности пользователя. Нет записи в БД → дефолты (null-safe).
 */
export async function getSafetySettings(userId: number): Promise<SafetySettings> {
  await ensureReady();
  const res = await getPool().query<{
    sos_enabled: boolean;
    auto_share: boolean;
    women_only: boolean;
    trusted_name: string | null;
    trusted_phone: string | null;
  }>(
    `SELECT sos_enabled, auto_share, women_only, trusted_name, trusted_phone
       FROM safety_settings WHERE user_id = $1`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return DEFAULT_SAFETY_SETTINGS;
  }
  return {
    sosEnabled: row.sos_enabled,
    autoShare: row.auto_share,
    womenOnly: row.women_only,
    trustedContact:
      row.trusted_name !== null && row.trusted_phone !== null
        ? { name: row.trusted_name, phone: row.trusted_phone }
        : null,
  };
}

/**
 * Сохранить настройки безопасности целиком (UPSERT по user_id).
 * trustedContact: null → trusted_name/trusted_phone пишутся NULL (контакт удалён).
 */
export async function saveSafetySettings(
  userId: number,
  settings: SafetySettings,
): Promise<void> {
  await ensureReady();
  await getPool().query(
    `INSERT INTO safety_settings (user_id, sos_enabled, auto_share, women_only, trusted_name, trusted_phone, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE
       SET sos_enabled = EXCLUDED.sos_enabled,
           auto_share = EXCLUDED.auto_share,
           women_only = EXCLUDED.women_only,
           trusted_name = EXCLUDED.trusted_name,
           trusted_phone = EXCLUDED.trusted_phone,
           updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      settings.sosEnabled,
      settings.autoShare,
      settings.womenOnly,
      settings.trustedContact?.name ?? null,
      settings.trustedContact?.phone ?? null,
    ],
  );
}
