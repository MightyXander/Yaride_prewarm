/**
 * Отправка кода подтверждения номера (issue #328, RedSMS-провайдер — issue #355).
 *
 * Провайдер выбирается env SMS_PROVIDER ('smsc' | 'redsms'), дефолт 'smsc' —
 * без этой переменной поведение идентично исходному (SMSC.ru).
 *
 * SMSC.ru: креды SMSC_LOGIN/SMSC_PASSWORD. Если хотя бы один пуст — модуль
 * no-op (isSmsConfigured() === false, sendVerificationCode() ничего не
 * отправляет и возвращает false), остальной бэкенд работает как обычно.
 * Инициализация ленивая: конфигурация читается один раз и кэшируется.
 *
 * Канал доставки — env SMS_CHANNEL:
 *  - 'flash_call' (дефолт) — звонок робота, код = последние 4 цифры номера
 *    звонящего (параметр call=1&mes=<код> в запросе к send.php); дешевле
 *    обычной SMS (0,25–0,33 руб/верификация).
 *  - 'sms' — обычное сообщение с кодом в тексте.
 *
 * Эндпоинт https://smsc.ru/sys/send.php, авторизация login+psw, fmt=3 —
 * JSON-ответ. Ошибки логируются, наружу не бросаются (best-effort, как fcm.ts).
 *
 * RedSMS (SMS_PROVIDER=redsms): креды REDSMS_LOGIN/REDSMS_API_KEY (API-ключ,
 * не путать с SMSC_PASSWORD). Поддерживается только flash call — SMS_CHANNEL=sms
 * с этим провайдером не реализован (no-op + warn в лог). Эндпоинт
 * POST https://cp.redsms.ru/api/message, авторизация заголовками
 * login/ts/secret, где secret = md5(ts + REDSMS_API_KEY). Успех — HTTP 200
 * и success:true в JSON-ответе. Док: https://docs.redsms.ru/http/send-message-fcall/
 */

import { createHash } from 'node:crypto';

const SMSC_SEND_URL = 'https://smsc.ru/sys/send.php';
const REDSMS_SEND_URL = 'https://cp.redsms.ru/api/message';
const REQUEST_TIMEOUT_MS = 10_000;

let configChecked = false;
let configured = false;

export type SmsChannel = 'flash_call' | 'sms';
export type SmsProvider = 'smsc' | 'redsms';

export function getChannel(): SmsChannel {
  const raw = (process.env.SMS_CHANNEL ?? '').trim().toLowerCase();
  return raw === 'sms' ? 'sms' : 'flash_call';
}

/** Активный провайдер SMS. Env SMS_PROVIDER, дефолт 'smsc'. */
export function getProvider(): SmsProvider {
  const raw = (process.env.SMS_PROVIDER ?? '').trim().toLowerCase();
  return raw === 'redsms' ? 'redsms' : 'smsc';
}

/** Сконфигурирован ли модуль (креды активного провайдера непусты). Кэшируется один раз. */
export function isSmsConfigured(): boolean {
  if (configChecked) {
    return configured;
  }
  configChecked = true;

  if (getProvider() === 'redsms') {
    const login = (process.env.REDSMS_LOGIN ?? '').trim();
    const apiKey = (process.env.REDSMS_API_KEY ?? '').trim();
    configured = login !== '' && apiKey !== '';
    if (configured) {
      console.log(`[sms:redsms] RedSMS сконфигурирован, канал: ${getChannel()}`);
    } else {
      console.log('[sms:redsms] REDSMS_LOGIN/REDSMS_API_KEY не заданы — подтверждение номера отключено');
    }
    return configured;
  }

  const login = (process.env.SMSC_LOGIN ?? '').trim();
  const password = (process.env.SMSC_PASSWORD ?? '').trim();
  configured = login !== '' && password !== '';
  if (configured) {
    console.log(`[sms] SMSC.ru сконфигурирован, канал: ${getChannel()}`);
  } else {
    console.log('[sms] SMSC_LOGIN/SMSC_PASSWORD не заданы — подтверждение номера отключено');
  }
  return configured;
}

/**
 * Отправить код подтверждения на номер (E.164 +7XXXXXXXXXX). Best-effort:
 * ошибки логируются, не пробрасываются — возвращает false при любой неудаче
 * (включая отсутствие кредов). Провайдер выбирается SMS_PROVIDER.
 */
export async function sendVerificationCode(phone: string, code: string): Promise<boolean> {
  if (!isSmsConfigured()) {
    return false;
  }

  if (getProvider() === 'redsms') {
    return sendViaRedsms(phone, code);
  }
  return sendViaSmsc(phone, code);
}

/** Отправка через SMSC.ru — код без изменений (issue #328). */
async function sendViaSmsc(phone: string, code: string): Promise<boolean> {
  const login = (process.env.SMSC_LOGIN ?? '').trim();
  const password = (process.env.SMSC_PASSWORD ?? '').trim();
  const channel = getChannel();

  const params = new URLSearchParams({
    login,
    psw: password,
    phones: phone,
    fmt: '3',
  });
  if (channel === 'flash_call') {
    params.set('call', '1');
    params.set('mes', code);
  } else {
    params.set('mes', `Код подтверждения Yaride: ${code}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${SMSC_SEND_URL}?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok || (data !== null && typeof data === 'object' && 'error' in data)) {
      console.error('[sms] send failed:', data ?? res.status);
      return false;
    }
    console.log(`[sms] код отправлен (канал: ${channel})`);
    return true;
  } catch (e) {
    console.error('[sms] send error:', e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Отправка через RedSMS flash call (issue #355). */
async function sendViaRedsms(phone: string, code: string): Promise<boolean> {
  const channel = getChannel();
  if (channel === 'sms') {
    console.warn('[sms:redsms] SMS_CHANNEL=sms не поддерживается для RedSMS — доступен только flash call');
    return false;
  }

  const login = (process.env.REDSMS_LOGIN ?? '').trim();
  const apiKey = (process.env.REDSMS_API_KEY ?? '').trim();
  const ts = Date.now().toString();
  const secret = createHash('md5').update(ts + apiKey).digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(REDSMS_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        login,
        ts,
        secret,
      },
      body: JSON.stringify({ route: 'fcall', to: phone, text: code }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (!res.ok || data === null || data.success !== true) {
      console.error('[sms:redsms] send failed:', data ?? res.status);
      return false;
    }
    console.log('[sms:redsms] код отправлен (канал: flash_call)');
    return true;
  } catch (e) {
    console.error('[sms:redsms] send error:', e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
