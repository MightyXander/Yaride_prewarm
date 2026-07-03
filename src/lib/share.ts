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
