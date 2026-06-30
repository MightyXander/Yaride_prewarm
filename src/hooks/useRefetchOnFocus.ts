import { useEffect, useRef } from 'react';

/**
 * Хуки авто-обновления данных, чтобы UI не «протухал» без ручной перезагрузки.
 *
 * Проблема: после действий, меняющих состояние на бэкенде (одобрение ВУ админом,
 * публикация поездки, бронь/отмена, рейтинг), экран показывает устаревшие данные,
 * пока пользователь не перезагрузит страницу. Эти хуки дают единый механизм
 * перефетча без тяжёлых зависимостей — только нативные браузерные события.
 */

// Минимальный интервал между вызовами callback (мс). Гасит двойной вызов,
// когда focus и visibilitychange прилетают почти одновременно при возврате к вкладке.
const COALESCE_WINDOW_MS = 800;

/**
 * Вызывает `callback`, когда вкладка снова получает фокус или становится видимой.
 *
 * Слушает `window` `focus` и `document` `visibilitychange`. Идентичность callback
 * может меняться между рендерами — внутри используется ref, поэтому подписка
 * не пересоздаётся и не требует мемоизации на стороне вызова.
 *
 * @param callback — что выполнить при возврате фокуса/видимости (обычно рефетч).
 * @param enabled — выключатель (по умолчанию true). Когда false — слушатели не вешаются.
 */
export function useRefetchOnFocus(callback: () => void, enabled = true): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      const now = Date.now();
      if (now - lastRunRef.current < COALESCE_WINDOW_MS) return;
      lastRunRef.current = now;
      callbackRef.current();
    };

    const handleFocus = () => run();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled]);
}

/**
 * Периодически вызывает `callback` раз в `intervalMs`, пока `enabled === true`.
 *
 * Интервал автоматически приостанавливается, когда вкладка скрыта
 * (`document.hidden`), и возобновляется при возврате видимости — без агрессивного
 * polling в фоне. Идентичность callback может меняться (используется ref).
 *
 * @param callback — что выполнять по тику (обычно лёгкий рефетч списка).
 * @param intervalMs — период в миллисекундах.
 * @param enabled — активен ли polling (например, только пока открыт нужный экран).
 */
export function usePollingRefetch(callback: () => void, intervalMs: number, enabled = true): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer !== undefined) return;
      timer = setInterval(() => {
        // Подстраховка: не дёргаем сеть, пока вкладка скрыта.
        if (document.visibilityState === 'visible') callbackRef.current();
      }, intervalMs);
    };

    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    // Стартуем только если вкладка сейчас видима.
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, intervalMs]);
}
