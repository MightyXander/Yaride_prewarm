/**
 * Работа с Telegram Bot API:
 *  - Валидация initData для Mini App (WebApp.initData)
 *  - Отправка сообщений через Bot API (sendMessage)
 *  - Регистрация webhook (setWebhook)
 *  - Обработка входящих updates (handleWebhookUpdate)
 *
 * Алгоритм валидации initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
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

// ============================================================================
// Telegram Bot API helpers
// ============================================================================

const TELEGRAM_API_BASE = 'https://api.telegram.org';

interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: {
    inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
  };
}

/**
 * Отправить сообщение через Bot API sendMessage.
 *
 * @param chatId ID чата (Telegram user ID или chat ID)
 * @param text Текст сообщения
 * @param opts Опции (parse_mode, reply_markup и т.д.)
 * @param botToken BOT_TOKEN (process.env.BOT_TOKEN); если пусто — ошибка
 * @returns true при успехе, false при ошибке (логируется)
 */
export async function sendMessage(
  chatId: number | string,
  text: string,
  opts?: SendMessageOptions,
  botToken?: string | null,
): Promise<boolean> {
  const token = (botToken ?? process.env.BOT_TOKEN ?? '').trim();
  if (token === '') {
    console.error('sendMessage: BOT_TOKEN отсутствует');
    return false;
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    ...opts,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`sendMessage failed (${response.status}):`, errorText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('sendMessage exception:', err);
    return false;
  }
}

/**
 * Зарегистрировать webhook через Bot API setWebhook.
 *
 * @param webhookUrl Полный URL webhook endpoint (напр. https://example.com/webhook/telegram)
 * @param secretToken Секрет для заголовка X-Telegram-Bot-Api-Secret-Token
 * @param botToken BOT_TOKEN (process.env.BOT_TOKEN); если пусто — ошибка
 * @returns true при успехе, false при ошибке (логируется)
 */
export async function setWebhook(
  webhookUrl: string,
  secretToken?: string,
  botToken?: string | null,
): Promise<boolean> {
  const token = (botToken ?? process.env.BOT_TOKEN ?? '').trim();
  if (token === '') {
    console.error('setWebhook: BOT_TOKEN отсутствует');
    return false;
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/setWebhook`;
  const payload: Record<string, unknown> = { url: webhookUrl };
  if (secretToken) {
    payload.secret_token = secretToken;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`setWebhook failed (${response.status}):`, errorText);
      return false;
    }

    const result = (await response.json()) as { ok: boolean; description?: string };
    if (!result.ok) {
      console.error('setWebhook returned ok=false:', result.description ?? '');
      return false;
    }

    console.log(`Webhook установлен: ${webhookUrl}`);
    return true;
  } catch (err) {
    console.error('setWebhook exception:', err);
    return false;
  }
}

// ============================================================================
// Webhook update handler
// ============================================================================

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number }>;
  };
}

/**
 * Обработать входящий update от Telegram webhook.
 * Сейчас обрабатывает команду /start: отправляет приветствие + кнопку открыть Mini App.
 *
 * @param update Объект update от Telegram
 * @param miniAppUrl URL Mini App (env MINIAPP_URL), для кнопки
 * @param botToken BOT_TOKEN (process.env.BOT_TOKEN)
 * @returns true при успешной обработке
 */
export async function handleWebhookUpdate(
  update: TelegramUpdate,
  miniAppUrl?: string,
  botToken?: string | null,
): Promise<boolean> {
  const message = update.message;
  if (!message) {
    return true;
  }

  const chatId = message.chat.id;
  const text = message.text ?? '';

  if (text.startsWith('/start')) {
    const appUrl = (miniAppUrl ?? process.env.MINIAPP_URL ?? '').trim();
    const greeting =
      'Привет! Это бот Yaride — попутчики из Екатеринбурга в Пермь (и обратно).';

    const opts: SendMessageOptions = {};

    if (appUrl !== '') {
      opts.reply_markup = {
        inline_keyboard: [[{ text: 'Открыть приложение', url: appUrl }]],
      };
    }

    const sent = await sendMessage(chatId, greeting, opts, botToken);
    return sent;
  }

  return true;
}
