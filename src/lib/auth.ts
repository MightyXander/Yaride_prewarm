/**
 * Контекст запуска и гейтинг браузерной авторизации.
 *
 * Реальная браузерная сессия — серверная (httpOnly-cookie + GET /api/auth/me).
 * Этот модуль только определяет КОНТЕКСТ запуска: настоящий Telegram-клиент или
 * браузер. Само состояние «вошёл» теперь приходит с backend (App.tsx → getMe()).
 */

/**
 * Открыто ли приложение в РЕАЛЬНОМ Telegram-клиенте.
 *
 * Скрипт telegram-web-app.js подключён в index.html всегда, поэтому
 * `window.Telegram.WebApp` существует и в обычном браузере — но там
 * `platform === 'unknown'` и `initData` пустой. Реальный Telegram задаёт
 * конкретную платформу (ios/android/tdesktop/web…) и непустой подписанный initData.
 */
export function isTelegramContext(): boolean {
  try {
    const wa = window.Telegram?.WebApp as
      | (NonNullable<NonNullable<Window['Telegram']>['WebApp']> & { platform?: string })
      | undefined;
    if (!wa) return false;
    if (wa.platform && wa.platform !== 'unknown') return true;
    if (wa.initData && wa.initData.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Нужно ли показывать гейт браузерной авторизации (FAIL-SAFE — баг ревью #1).
 *
 * Гейт показываем ТОЛЬКО когда мы УВЕРЕНЫ, что это браузер без Telegram:
 *   - `window.Telegram.WebApp` существует, И
 *   - `platform === 'unknown'`, И
 *   - `initData` пустой.
 *
 * Если `window.Telegram` отсутствует (скрипт telegram-web-app.js не загрузился —
 * блокировка/сеть), мы НЕ уверены, что это браузер, поэтому гейт НЕ показываем,
 * чтобы случайно не запереть реального Telegram-пользователя. Раньше логика была
 * обратной (нет Telegram → гейт), что и приводило к запиранию.
 */
export function shouldGateBrowserAuth(): boolean {
  try {
    const wa = window.Telegram?.WebApp as
      | (NonNullable<NonNullable<Window['Telegram']>['WebApp']> & { platform?: string })
      | undefined;
    if (!wa) return false; // скрипт не загрузился → не уверены → не гейтим
    const platformUnknown = !wa.platform || wa.platform === 'unknown';
    const initDataEmpty = !wa.initData || wa.initData.length === 0;
    return platformUnknown && initDataEmpty;
  } catch {
    return false;
  }
}
