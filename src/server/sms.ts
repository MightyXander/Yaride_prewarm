/**
 * Отправка кода подтверждения номера через SMSC.ru (issue #328).
 *
 * Креды берутся из env SMSC_LOGIN/SMSC_PASSWORD. Если хотя бы один пуст —
 * модуль no-op (isSmsConfigured() === false, sendVerificationCode() ничего
 * не отправляет и возвращает false), остальной бэкенд работает как обычно.
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
 */

const SMSC_SEND_URL = 'https://smsc.ru/sys/send.php';
const REQUEST_TIMEOUT_MS = 10_000;

let configChecked = false;
let configured = false;

export type SmsChannel = 'flash_call' | 'sms';

export function getChannel(): SmsChannel {
  const raw = (process.env.SMS_CHANNEL ?? '').trim().toLowerCase();
  return raw === 'sms' ? 'sms' : 'flash_call';
}

/** Сконфигурирован ли модуль (оба креда SMSC непусты). Кэшируется один раз. */
export function isSmsConfigured(): boolean {
  if (configChecked) {
    return configured;
  }
  configChecked = true;
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
 * (включая отсутствие кредов).
 */
export async function sendVerificationCode(phone: string, code: string): Promise<boolean> {
  if (!isSmsConfigured()) {
    return false;
  }

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
