/**
 * Репортер необработанных ошибок фронта (issue #470, наблюдаемость).
 *
 * reportError отправляет message + stack + контекст на POST /api/errors/report
 * (бэк пишет в таблицу error_traces) — дебаг по БД без доступа к консоли
 * клиента. Подключается в трёх местах:
 *   - window.addEventListener('error') / ('unhandledrejection') — main.tsx;
 *   - ErrorBoundary.componentDidCatch — ошибки рендера экранов.
 *
 * Репортер НИКОГДА не бросает и не шумит: сбой отправки молча глотается
 * (сломанный fetch не должен зациклить «ошибка → репорт → ошибка»). Дедуп:
 * одинаковый message не отправляется повторно в течение 30 секунд.
 */

const DEDUP_WINDOW_MS = 30_000;

/** message → время последней отправки. Чистится лениво при переполнении. */
const recentlySent = new Map<string, number>();

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    const isErr = error instanceof Error;
    const message =
      (isErr ? error.message : typeof error === 'string' ? error : JSON.stringify(error)) ||
      'Unknown error';

    const now = Date.now();
    const lastSentAt = recentlySent.get(message);
    if (lastSentAt !== undefined && now - lastSentAt < DEDUP_WINDOW_MS) {
      return;
    }
    if (recentlySent.size > 200) {
      for (const [key, sentAt] of recentlySent) {
        if (now - sentAt >= DEDUP_WINDOW_MS) recentlySent.delete(key);
      }
    }
    recentlySent.set(message, now);

    // Заголовок initData — как в apiFetch (src/lib/api.ts): даёт бэку опознать
    // Telegram-пользователя; браузерная cookie-сессия уходит сама (same-origin).
    const initData = window.Telegram?.WebApp?.initData ?? '';

    // keepalive: репорт доезжает даже при закрытии/перезагрузке страницы.
    void fetch('/api/errors/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
      },
      body: JSON.stringify({
        message,
        errorType: isErr ? error.name : null,
        stack: isErr ? (error.stack ?? null) : null,
        context: { ...context, url: window.location.href },
      }),
      keepalive: true,
    }).catch(() => {
      // Сервер недоступен/сеть упала — молча глотаем.
    });
  } catch {
    // Репортер никогда не бросает.
  }
}
