/**
 * Привязка Telegram из профиля (issue #401): одноразовые токены deep-link
 * `t.me/<бот>?start=link_<токен>` + резолв токена в бота (`/start link_...`).
 *
 * Токен: 32 случайных байта (base64url), в БД — только его sha256-хэш (тот же
 * паттерн, что sessions.token_hash в auth.ts). TTL 10 минут, одноразовый
 * (used_at). Троттлинг выдачи — countRecentLinkTokens (~5/15мин на юзера,
 * считается вызывающей стороной в api.ts, как PHONE_CODE_RESEND_COOLDOWN в
 * handleSendPhoneVerificationCode).
 */

import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';

import { ensureReady, getPool, withTransaction } from '../db.ts';
import { mergeTelegramOnlyIntoAccount } from './merge.ts';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 10 * 60 * 1000;

function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreateLinkTokenResult {
  /** Сырой токен (кладётся в URL, в БД НЕ хранится). */
  token: string;
  expiresAt: Date;
}

/**
 * Сколько токенов пользователь выпустил за последние `windowMs` — для
 * троттлинга POST /api/me/telegram-link-token (~5/15мин, решено в issue #401).
 */
export async function countRecentLinkTokens(userId: number, windowMs: number): Promise<number> {
  await ensureReady();
  const since = new Date(Date.now() - windowMs);
  const res = await getPool().query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM telegram_link_tokens WHERE user_id = $1 AND created_at > $2',
    [userId, since],
  );
  return Number(res.rows[0]?.count ?? '0');
}

/** Выпустить одноразовый токен привязки TG. Сырой токен нигде, кроме ответа, не хранится. */
export async function createLinkToken(userId: number): Promise<CreateLinkTokenResult> {
  await ensureReady();
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashLinkToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await getPool().query(
    'INSERT INTO telegram_link_tokens(user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
  return { token, expiresAt };
}

export interface ConsumedLinkToken {
  userId: number;
}

/**
 * Погасить токен привязки атомарно: найти по хэшу непросроченный и
 * неиспользованный, сразу проставить used_at в одном UPDATE ... RETURNING —
 * при гонке (двойной клик по ссылке / повторная доставка апдейта из Telegram)
 * ровно один вызов увидит непустой результат. Возвращает null для
 * несуществующего/просроченного/уже использованного токена.
 */
export async function consumeLinkToken(rawToken: string): Promise<ConsumedLinkToken | null> {
  await ensureReady();
  const tokenHash = hashLinkToken(rawToken);
  const res = await getPool().query<{ user_id: number }>(
    `UPDATE telegram_link_tokens
        SET used_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      RETURNING user_id`,
    [tokenHash],
  );
  const row = res.rows[0];
  return row ? { userId: row.user_id } : null;
}

/** tg_user_id занят ДРУГИМ аккаунтом с кредами (не может быть слит автоматически). */
export class TelegramAlreadyLinkedError extends Error {
  constructor() {
    super('telegram_already_linked');
    this.name = 'TelegramAlreadyLinkedError';
  }
}

export type LinkTelegramResult = 'linked' | 'already_linked';

/**
 * Привязать Telegram-аккаунт (tgUserId) к пользователю userId (issue #401).
 * Три кейса (решённые развилки из спеки):
 *  1. tg_user_id свободен → простой UPDATE. Если он уже стоит НА этом же userId —
 *     идемпотентно, ничего не делаем ('already_linked').
 *  2. tg_user_id занят TG-only карточкой (email/password_hash оба NULL) —
 *     сливаем её в userId через mergeTelegramOnlyIntoAccount: креды userId
 *     сохраняются, история TG-only карточки переезжает, сама она удаляется.
 *  3. tg_user_id занят карточкой С кредами (другой полноценный аккаунт) —
 *     TelegramAlreadyLinkedError, ничего не меняем.
 *
 * SELECT ... FOR UPDATE на строке-владельце tg_user_id (если она есть) держит
 * лок до конца транзакции — защита от гонки параллельных /start link_... с тем
 * же tg_user_id (маловероятно, но дёшево гарантировать).
 */
export async function linkTelegramToUser(userId: number, tgUserId: number): Promise<LinkTelegramResult> {
  await ensureReady();
  return withTransaction(async (client: PoolClient): Promise<LinkTelegramResult> => {
    const ownerRes = await client.query<{ id: number; email: string | null; password_hash: string | null }>(
      'SELECT id, email, password_hash FROM users WHERE tg_user_id = $1 FOR UPDATE',
      [tgUserId],
    );
    const owner = ownerRes.rows[0] ?? null;

    if (owner === null) {
      await client.query('UPDATE users SET tg_user_id = $2 WHERE id = $1', [userId, tgUserId]);
      return 'linked';
    }

    if (owner.id === userId) {
      // Уже привязан к этому же аккаунту (повторный /start link_... по старой
      // ссылке до истечения TTL, или двойная доставка апдейта) — идемпотентно.
      return 'already_linked';
    }

    const isTelegramOnly = owner.email === null && owner.password_hash === null;
    if (!isTelegramOnly) {
      throw new TelegramAlreadyLinkedError();
    }

    await mergeTelegramOnlyIntoAccount(client, userId, owner.id, tgUserId);
    return 'linked';
  });
}
