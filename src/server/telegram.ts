/**
 * Валидация Telegram Mini App initData (WebApp.initData).
 *
 * Алгоритм (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *  1. Разобрать initData как query-string (urlencoded пары key=value).
 *  2. Вынуть hash, оставшиеся пары отсортировать по ключу и склеить как
 *     "key=value\nkey=value" → data_check_string.
 *  3. secret_key = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN).
 *  4. Ожидаемый hash = HMAC_SHA256(key=secret_key, message=data_check_string) (hex).
 *  5. Сравнить с переданным hash (constant-time).
 *
 * Без BOT_TOKEN (dev/локально) подпись не проверяется: парсим user из initData
 * и помечаем результат devBypass=true (видно в логах/ответах). Это намеренно,
 * чтобы поднять API без секрета; в проде BOT_TOKEN обязателен.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface InitDataResult {
  ok: boolean;
  user: TelegramUser | null;
  /** true, если подпись не проверялась из-за отсутствия BOT_TOKEN. */
  devBypass: boolean;
  error?: string;
}

/** Собрать display-name из Telegram-пользователя (first + last). */
export function telegramDisplayName(user: TelegramUser): string {
  const parts = [user.first_name, user.last_name]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  if (user.username && user.username.trim().length > 0) {
    return user.username.trim();
  }
  return 'Пассажир';
}

function parseUserField(raw: string | null): TelegramUser | null {
  if (raw === null) {
    return null;
  }
  try {
    const obj = JSON.parse(raw) as unknown;
    if (
      typeof obj === 'object' &&
      obj !== null &&
      'id' in obj &&
      typeof (obj as { id: unknown }).id === 'number'
    ) {
      return obj as TelegramUser;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Проверить initData и вернуть пользователя.
 *
 * @param initData сырое значение Telegram.WebApp.initData (query-string).
 * @param botToken токен бота (process.env.BOT_TOKEN); пусто/undefined → dev-bypass.
 */
export function verifyInitData(
  initData: string | undefined | null,
  botToken: string | undefined | null,
): InitDataResult {
  if (initData === undefined || initData === null || initData.trim() === '') {
    return { ok: false, user: null, devBypass: false, error: 'initData отсутствует' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const user = parseUserField(params.get('user'));

  const token = (botToken ?? '').trim();
  if (token === '') {
    // Dev-режим: подпись не проверяем, но пользователь обязателен.
    if (user === null) {
      return {
        ok: false,
        user: null,
        devBypass: true,
        error: 'initData не содержит user',
      };
    }
    return { ok: true, user, devBypass: true };
  }

  if (hash === null || hash === '') {
    return { ok: false, user, devBypass: false, error: 'initData без hash' };
  }

  // data_check_string: все пары кроме hash, отсортированы по ключу.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') {
      continue;
    }
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  let valid = false;
  try {
    const a = Buffer.from(expectedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    valid = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    valid = false;
  }

  if (!valid) {
    return { ok: false, user, devBypass: false, error: 'Подпись initData неверна' };
  }
  if (user === null) {
    return {
      ok: false,
      user: null,
      devBypass: false,
      error: 'initData не содержит user',
    };
  }

  return { ok: true, user, devBypass: false };
}
