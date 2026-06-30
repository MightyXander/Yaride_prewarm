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

/**
 * Ответить на callback_query через Bot API answerCallbackQuery.
 *
 * @param callbackQueryId ID callback_query из update
 * @param text Текст уведомления (опционально, макс. 200 символов)
 * @param showAlert true — показать алерт, false — нотификацию (по умолчанию false)
 * @param botToken BOT_TOKEN (process.env.BOT_TOKEN); если пусто — ошибка
 * @returns true при успехе, false при ошибке (логируется)
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
  botToken?: string | null,
): Promise<boolean> {
  const token = (botToken ?? process.env.BOT_TOKEN ?? '').trim();
  if (token === '') {
    console.error('answerCallbackQuery: BOT_TOKEN отсутствует');
    return false;
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/answerCallbackQuery`;
  const payload: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
  };
  if (text) {
    payload.text = text;
  }
  if (showAlert) {
    payload.show_alert = true;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`answerCallbackQuery failed (${response.status}):`, errorText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('answerCallbackQuery exception:', err);
    return false;
  }
}

/**
 * Редактировать reply_markup сообщения через Bot API editMessageReplyMarkup.
 *
 * @param chatId ID чата
 * @param messageId ID сообщения
 * @param replyMarkup Новый reply_markup (или null для удаления)
 * @param botToken BOT_TOKEN (process.env.BOT_TOKEN); если пусто — ошибка
 * @returns true при успехе, false при ошибке (логируется)
 */
export async function editMessageReplyMarkup(
  chatId: number | string,
  messageId: number,
  replyMarkup:
    | {
        inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
      }
    | null,
  botToken?: string | null,
): Promise<boolean> {
  const token = (botToken ?? process.env.BOT_TOKEN ?? '').trim();
  if (token === '') {
    console.error('editMessageReplyMarkup: BOT_TOKEN отсутствует');
    return false;
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/editMessageReplyMarkup`;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
  };
  if (replyMarkup !== null) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`editMessageReplyMarkup failed (${response.status}):`, errorText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('editMessageReplyMarkup exception:', err);
    return false;
  }
}

/**
 * Редактировать текст сообщения через Bot API editMessageText.
 *
 * @param chatId ID чата
 * @param messageId ID сообщения
 * @param text Новый текст сообщения
 * @param opts Опции (parse_mode, reply_markup и т.д.)
 * @param botToken BOT_TOKEN (process.env.BOT_TOKEN); если пусто — ошибка
 * @returns true при успехе, false при ошибке (логируется)
 */
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  opts?: {
    parse_mode?: 'Markdown' | 'HTML';
    reply_markup?: {
      inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
    };
  },
  botToken?: string | null,
): Promise<boolean> {
  const token = (botToken ?? process.env.BOT_TOKEN ?? '').trim();
  if (token === '') {
    console.error('editMessageText: BOT_TOKEN отсутствует');
    return false;
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/editMessageText`;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
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
      console.error(`editMessageText failed (${response.status}):`, errorText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('editMessageText exception:', err);
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
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
        type: string;
      };
      text?: string;
    };
    data?: string;
  };
}

/**
 * Обработать входящий update от Telegram webhook.
 * Обрабатывает:
 * - Команды: /start, /myalerts, /mytrips, /help, /zayavki (админ-очередь ВУ)
 * - callback_query: bk:cfm:<bookingId>, bk:dec:<bookingId>, al:cxl:<alertId>
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
  const token = (botToken ?? process.env.BOT_TOKEN ?? '').trim();

  // Обработка callback_query (кнопки в уведомлениях)
  if (update.callback_query) {
    return await handleCallbackQuery(update.callback_query, token);
  }

  // Обработка message (команды)
  const message = update.message;
  if (!message) {
    return true;
  }

  const chatId = message.chat.id;
  const text = message.text ?? '';
  const tgUserId = message.from?.id;

  if (!tgUserId) {
    return true;
  }

  if (text.startsWith('/start')) {
    const appUrl = (miniAppUrl ?? process.env.MINIAPP_URL ?? '').trim();
    const greeting =
      '👋 Привет! Это ЯРайд — попутчики по Ярославлю.\n\n' +
      'Находите попутку или подвозите по пути: дешевле такси и удобнее, ' +
      'чем ждать маршрутку 🚗 Сейчас ездим по направлению Брагино ↔ центр, ' +
      'скоро добавим новые маршруты.\n\n' +
      'Откройте приложение кнопкой ниже — найдите поездку или предложите свои места.';

    const opts: SendMessageOptions = {};

    if (appUrl !== '') {
      opts.reply_markup = {
        inline_keyboard: [[{ text: 'Открыть приложение', url: appUrl }]],
      };
    }

    const sent = await sendMessage(chatId, greeting, opts, token);
    return sent;
  }

  const actor = { id: tgUserId, username: message.from?.username };

  if (text.startsWith('/help')) {
    return await handleHelpCommand(chatId, miniAppUrl, token, isAdminActor(actor));
  }

  if (text.startsWith('/myalerts')) {
    return await handleMyAlertsCommand(chatId, tgUserId, token);
  }

  if (text.startsWith('/mytrips')) {
    return await handleMyTripsCommand(chatId, tgUserId, token);
  }

  // Админ-очередь модерации ВУ. /zayavki — основная, /vu — короткий алиас.
  if (text.startsWith('/zayavki') || text.startsWith('/vu')) {
    return await handleLicenseQueueCommand(chatId, actor, token);
  }

  return true;
}

/**
 * Проверка прав администратора для модерации ВУ.
 *
 * Подтверждать/отклонять ВУ в чате бота может только админ. Признаётся админом тот,
 * у кого Telegram ID совпадает с ADMIN_CHAT_ID, ИЛИ username совпадает с ADMIN_USERNAME
 * (по умолчанию 'mightyxander'). Сравнение username — регистронезависимое, ведущий '@' срезается.
 */
function isAdminActor(from: { id: number; username?: string }): boolean {
  const adminChatId = Number((process.env.ADMIN_CHAT_ID ?? '').trim());
  const adminUsername = (process.env.ADMIN_USERNAME ?? 'mightyxander')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (adminChatId && from.id === adminChatId) {
    return true;
  }
  if (adminUsername && (from.username ?? '').toLowerCase() === adminUsername) {
    return true;
  }
  return false;
}

/**
 * Обработать callback_query (нажатие на inline-кнопку).
 * callback_data format:
 * - bk:cfm:<bookingId> — подтвердить бронь
 * - bk:dec:<bookingId> — отклонить бронь
 * - al:cxl:<alertId> — снять заявку (route_alert)
 * - lic:ok:<requestId> — подтвердить ВУ (только админ)
 * - lic:no:<requestId> — отклонить ВУ (только админ)
 *
 * Проверяет владельца через from.id (Telegram user ID):
 * - bk:* — инициатор должен быть водителем поездки брони
 * - al:cxl — инициатор должен быть владельцем алерта
 * - lic:* — инициатор должен быть админом (isAdminActor)
 */
async function handleCallbackQuery(
  callbackQuery: NonNullable<TelegramUpdate['callback_query']>,
  botToken: string,
): Promise<boolean> {
  const data = callbackQuery.data ?? '';
  const from = callbackQuery.from;
  const message = callbackQuery.message;

  if (data === '') {
    await answerCallbackQuery(callbackQuery.id, 'Неизвестная команда', false, botToken);
    return true;
  }

  const parts = data.split(':');
  if (parts.length < 3) {
    await answerCallbackQuery(callbackQuery.id, 'Неверный формат данных', false, botToken);
    return true;
  }

  const [prefix, action, idStr] = parts;
  const id = Number(idStr);
  if (isNaN(id)) {
    await answerCallbackQuery(callbackQuery.id, 'Неверный ID', false, botToken);
    return true;
  }

  try {
    if (prefix === 'bk') {
      // Брони: проверка что from.id — водитель поездки
      if (action === 'cfm') {
        // Подтвердить бронь
        const { confirmBookingByDriver } = await import('./repo.ts');
        const result = await confirmBookingByDriver(id, from.id);

        // Уведомить пассажира о подтверждении (in-app лента + Telegram), fire-and-forget
        const { notifyPassengerAboutBookingDecision: notifyConfirm } = await import('./notify.ts');
        void notifyConfirm({
          passengerId: result.passengerId,
          passengerTgUserId: result.passengerTgUserId,
          tripId: result.tripId,
          startTitle: result.startTitle,
          endTitle: result.endTitle,
          tripDate: result.tripDate,
          departureTime: result.departureTime,
          confirmed: true,
        });

        await answerCallbackQuery(
          callbackQuery.id,
          `Бронь подтверждена: ${result.passengerName}, ${result.seats} мест`,
          false,
          botToken,
        );

        if (message) {
          await editMessageText(
            message.chat.id,
            message.message_id,
            `${message.text ?? ''}\n\n✅ Подтверждено`,
            { reply_markup: { inline_keyboard: [] } },
            botToken,
          );
        }

        return true;
      } else if (action === 'dec') {
        // Отклонить бронь
        const { cancelBookingByDriver } = await import('./repo.ts');
        const result = await cancelBookingByDriver(id, from.id);

        // Уведомить пассажира об отклонении (in-app лента + Telegram), fire-and-forget
        const { notifyPassengerAboutBookingDecision: notifyDecline } = await import('./notify.ts');
        void notifyDecline({
          passengerId: result.passengerId,
          passengerTgUserId: result.passengerTgUserId,
          tripId: result.tripId,
          startTitle: result.startTitle,
          endTitle: result.endTitle,
          tripDate: result.tripDate,
          departureTime: result.departureTime,
          confirmed: false,
        });

        await answerCallbackQuery(
          callbackQuery.id,
          `Бронь отклонена, освобождено мест: ${result.seatsFreed}`,
          false,
          botToken,
        );

        if (message) {
          await editMessageText(
            message.chat.id,
            message.message_id,
            `${message.text ?? ''}\n\n❌ Отклонено`,
            { reply_markup: { inline_keyboard: [] } },
            botToken,
          );
        }

        return true;
      }
    } else if (prefix === 'al' && action === 'cxl') {
      // Снять заявку (route_alert)
      const { updateAlertStatus } = await import('./repo.ts');
      await updateAlertStatus(id, 'cancelled', from.id);

      await answerCallbackQuery(callbackQuery.id, 'Заявка снята', false, botToken);

      if (message) {
        await editMessageText(
          message.chat.id,
          message.message_id,
          `${message.text ?? ''}\n\n🔕 Заявка снята`,
          { reply_markup: { inline_keyboard: [] } },
          botToken,
        );
      }

      return true;
    } else if (prefix === 'lic' && (action === 'ok' || action === 'no')) {
      // Модерация ВУ: подтвердить/отклонить заявку. Только админ (@mightyxander).
      if (!isAdminActor(from)) {
        await answerCallbackQuery(
          callbackQuery.id,
          'Недостаточно прав: проверять ВУ может только администратор.',
          true,
          botToken,
        );
        return true;
      }

      const approved = action === 'ok';
      const reviewer = from.username ? `@${from.username}` : String(from.id);
      const { approveLicenseRequest, rejectLicenseRequest } = await import('./repo.ts');
      const { notifyDriverAboutLicenseDecision } = await import('./notify.ts');

      const result = approved
        ? await approveLicenseRequest(id, reviewer)
        : await rejectLicenseRequest(id, reviewer);

      // Уведомить водителя о решении (fire-and-forget)
      void notifyDriverAboutLicenseDecision({
        driverTgUserId: result.driverTgUserId,
        approved,
      });

      await answerCallbackQuery(
        callbackQuery.id,
        approved
          ? `ВУ подтверждено: ${result.driverName}`
          : `ВУ отклонено: ${result.driverName}`,
        false,
        botToken,
      );

      if (message) {
        await editMessageText(
          message.chat.id,
          message.message_id,
          `${message.text ?? ''}\n\n${approved ? '✅ ВУ подтверждено' : '❌ ВУ отклонено'} (${reviewer})`,
          { reply_markup: { inline_keyboard: [] } },
          botToken,
        );
      }

      return true;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Ошибка обработки';
    console.error('[handleCallbackQuery] Ошибка:', err);
    await answerCallbackQuery(callbackQuery.id, errorMsg, true, botToken);
    return true;
  }

  await answerCallbackQuery(callbackQuery.id, 'Неизвестная команда', false, botToken);
  return true;
}

/**
 * Команда /help — справка по командам и боту.
 */
async function handleHelpCommand(
  chatId: number,
  miniAppUrl: string | undefined,
  botToken: string,
  isAdmin = false,
): Promise<boolean> {
  const appUrl = (miniAppUrl ?? process.env.MINIAPP_URL ?? '').trim();
  let text = `Доступные команды:

/start — приветствие и кнопка открыть приложение
/myalerts — активные заявки на поездки
/mytrips — мои поездки (водитель и пассажир)
/help — эта справка`;

  if (isAdmin) {
    text += `\n\nАдмин:\n/zayavki — очередь заявок на проверку ВУ`;
  }

  if (appUrl !== '') {
    text += `\n\nОткрыть приложение: нажмите кнопку ниже или используйте /start`;
  }

  const opts: SendMessageOptions = {};
  if (appUrl !== '') {
    opts.reply_markup = {
      inline_keyboard: [[{ text: 'Открыть приложение', url: appUrl }]],
    };
  }

  return await sendMessage(chatId, text, opts, botToken);
}

/**
 * Команда /zayavki (алиас /vu) — админ-очередь модерации ВУ.
 *
 * Push-уведомление о новой заявке (notifyAdminAboutLicenseRequest) приходит разово
 * в момент подачи. Эта команда позволяет в любой момент вытащить все pending-заявки
 * и промодерировать каждую теми же кнопками — callback lic:ok / lic:no обрабатывается
 * общим handleCallbackQuery (он же редактирует карточку с итогом ✅/❌).
 *
 * Доступ — только админ (isAdminActor). Карточек может быть несколько: по одной на
 * заявку, чтобы каждая редактировалась независимо после решения.
 */
async function handleLicenseQueueCommand(
  chatId: number,
  from: { id: number; username?: string },
  botToken: string,
): Promise<boolean> {
  if (!isAdminActor(from)) {
    return await sendMessage(
      chatId,
      'Эта команда доступна только администратору.',
      {},
      botToken,
    );
  }

  const { listPendingLicenseRequests } = await import('./repo.ts');
  const requests = await listPendingLicenseRequests();

  if (requests.length === 0) {
    return await sendMessage(chatId, '✅ Заявок на проверку ВУ нет.', {}, botToken);
  }

  await sendMessage(
    chatId,
    `🪪 Заявки на проверку ВУ: ${requests.length}\n\n` +
      `Ниже карточки — подтвердите или отклоните каждую.`,
    {},
    botToken,
  );

  for (const r of requests) {
    const handle = r.driverUsername ? `@${r.driverUsername}` : 'без username';
    const text =
      `🪪 Заявка на проверку ВУ #${r.requestId}\n\n` +
      `👤 Водитель: ${r.driverName}\n` +
      `🔗 ${handle}\n` +
      `🆔 Telegram ID: ${r.driverTgUserId}\n` +
      `📄 Серия/номер: ${r.seriesNumber}\n` +
      `📅 Действует до: ${r.validUntil}\n` +
      `🕒 Подана: ${r.createdAt}`;

    const opts: SendMessageOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Подтвердить ВУ', callback_data: `lic:ok:${r.requestId}` },
            { text: '❌ Отклонить', callback_data: `lic:no:${r.requestId}` },
          ],
        ],
      },
    };

    await sendMessage(chatId, text, opts, botToken);
  }

  return true;
}

/**
 * Команда /myalerts — активные route_alerts пользователя.
 */
async function handleMyAlertsCommand(
  chatId: number,
  tgUserId: number,
  botToken: string,
): Promise<boolean> {
  try {
    const { getPool } = await import('./db.ts');
    const pool = getPool();

    const alertsRes = await pool.query<{
      id: number;
      from_title: string;
      to_title: string;
      desired_date: string;
      desired_time: string | null;
    }>(
      `SELECT ra.id, fp.title AS from_title, tp.title AS to_title,
              ra.desired_date, ra.desired_time
       FROM route_alerts ra
       JOIN route_points fp ON fp.id = ra.from_point_id
       JOIN route_points tp ON tp.id = ra.to_point_id
       JOIN users u ON u.id = ra.passenger_id
       WHERE u.tg_user_id = $1 AND ra.status = 'active'
       ORDER BY ra.desired_date ASC, ra.desired_time ASC`,
      [tgUserId],
    );

    if (alertsRes.rows.length === 0) {
      return await sendMessage(chatId, 'Активных заявок нет.', undefined, botToken);
    }

    const lines = alertsRes.rows.map((r) => {
      const time = r.desired_time ?? 'любое время';
      return `• ${r.from_title} → ${r.to_title}, ${r.desired_date}, ${time}`;
    });

    const text = `Активные заявки:\n\n${lines.join('\n')}`;
    return await sendMessage(chatId, text, undefined, botToken);
  } catch (err) {
    console.error('[handleMyAlertsCommand] Ошибка:', err);
    return await sendMessage(chatId, 'Ошибка загрузки заявок.', undefined, botToken);
  }
}

/**
 * Команда /mytrips — поездки пользователя (как водителя + как пассажира).
 */
async function handleMyTripsCommand(
  chatId: number,
  tgUserId: number,
  botToken: string,
): Promise<boolean> {
  try {
    const { getUserTrips } = await import('./repo.ts');
    const trips = await getUserTrips(tgUserId, 'upcoming');

    if (trips.length === 0) {
      return await sendMessage(chatId, 'Предстоящих поездок нет.', undefined, botToken);
    }

    const lines = trips.map((t) => {
      const role = t.role === 'driver' ? 'Водитель' : 'Пассажир';
      return `• ${role}: ${t.start_title} → ${t.end_title}, ${t.trip_date} ${t.departure_time}`;
    });

    const text = `Предстоящие поездки:\n\n${lines.join('\n')}`;
    return await sendMessage(chatId, text, undefined, botToken);
  } catch (err) {
    console.error('[handleMyTripsCommand] Ошибка:', err);
    return await sendMessage(chatId, 'Ошибка загрузки поездок.', undefined, botToken);
  }
}
