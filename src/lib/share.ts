// Внешний шеринг заявки пассажира (виральная петля захвата спроса, CEO Council):
// заявка видна только внутри платформы, а нужно дать пассажиру звать водителя
// из внешних чатов (район/работа/«ищу попутчиков»).
//
// openTelegramLink() — единственно верный способ открыть t.me-ссылку из Mini App
// (в отличие от openLink(), который предназначен для внешних URL, не t.me):
// Telegram сам показывает нативный шит выбора чата, ничего не блокирует UI
// (в отличие от alert/confirm — то, что специально запрещено в задаче).

const BOT_USERNAME = 'Yaride_bot';
const MINIAPP_SHORT_NAME = 'app';

/**
 * Deep-link обратно в мини-апп — та же схема startapp=<prefix>-<id>, что уже
 * используют push-уведомления водителю (server/notify.ts: startapp=trip-<tripId>).
 * Для заявки пассажира отдельного экрана-детали пока нет, поэтому ведём
 * потенциального водителя в главный коридор (см. useStartParam: префикс 'alert-').
 */
export function buildAlertDeepLink(alertId?: number | null): string {
  const base = `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}`;
  return alertId != null ? `${base}?startapp=alert-${alertId}` : base;
}

/**
 * Deep-link на карточку конкретной поездки — та же схема startapp=trip-<id>,
 * что уже понимает useStartParam (префикс 'trip-') и что шлют push-уведомления
 * водителю (server/notify.ts). Используется для «Поделиться поездкой» из
 * TripDetailsScreen (issue #361).
 */
export function buildTripDeepLink(tripId: number): string {
  const base = `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}`;
  return `${base}?startapp=trip-${tripId}`;
}

/** Открывает нативный Telegram-шит "поделиться" с готовым текстом и ссылкой. */
export function shareToTelegram(text: string, url: string): void {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
    return;
  }
  // Вне Telegram (напр. локальная разработка в браузере) — просто открыть в новой вкладке,
  // без блокирующих alert/confirm.
  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Системный шеринг (Web Share API). На устройствах с navigator.share открывает
 * нативный лист «поделиться»; вне поддержки или при программной ошибке — фолбэк
 * на Telegram-шит (shareToTelegram), без блокирующих alert/confirm.
 * Отмену пользователем (AbortError) НЕ считаем ошибкой и не фолбэчим.
 */
export async function nativeShare(data: { title?: string; text: string; url: string }): Promise<void> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title: data.title, text: data.text, url: data.url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // Иная ошибка share — падаем на Telegram-фолбэк ниже.
    }
  }
  shareToTelegram(data.text, data.url);
}

/**
 * Копирование текста в буфер обмена. true — успех, false — не удалось
 * (вызывающий покажет toast). Пробуем Clipboard API, затем execCommand-фолбэк
 * для WebView/insecure-origin, где navigator.clipboard недоступен.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // Падаем на legacy-фолбэк ниже.
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
