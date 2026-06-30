/**
 * Мок-сессия браузерной авторизации (без backend).
 *
 * Гейтинг входа для пользователей БЕЗ Telegram: пока нет мок-сессии,
 * показываем экран 'auth-gate'. После «входа»/«регистрации» ставим флаг,
 * и при следующих заходах гейт не показывается.
 *
 * Реальная авторизация (JWT/cookie/привязка TG) — отдельная задача backend.
 */

const AUTH_KEY = 'yaride-auth';

/**
 * Открыто ли приложение в РЕАЛЬНОМ Telegram-клиенте.
 *
 * Важно: скрипт telegram-web-app.js подключён в index.html всегда, поэтому
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

/** Есть ли активная мок-сессия браузерного входа. */
export function hasAuthSession(): boolean {
  try {
    return localStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

/** Поставить мок-сессию (после успешного мок-сабмита логина/регистрации). */
export function setAuthSession(): void {
  try {
    localStorage.setItem(AUTH_KEY, '1');
  } catch {
    /* localStorage недоступен — просто не запоминаем */
  }
}

/** Снять мок-сессию (на будущее — «выйти»). */
export function clearAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* no-op */
  }
}
