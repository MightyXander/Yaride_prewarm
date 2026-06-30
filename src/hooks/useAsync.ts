import { useState, useEffect, useCallback } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

export interface UseAsyncOptions {
  immediate?: boolean;
}

/**
 * Хук для управления асинхронными операциями с состояниями loading/success/error.
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options: UseAsyncOptions = { immediate: true }
): AsyncState<T> & { retry: () => void; refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });

  // silent=true — тихое обновление: НЕ переводим состояние в 'loading', поэтому
  // уже показанные данные не сменяются скелетом (для авто-рефетча по фокусу/таймеру).
  const run = useCallback(async (silent: boolean) => {
    if (!silent) setState({ status: 'loading' });
    try {
      const data = await asyncFn();
      setState({ status: 'success', data });
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (options.immediate) {
      void run(false);
    }
  }, [run, options.immediate]);

  // retry — явный повтор (показывает loading), используется кнопкой «Повторить».
  // Игнорирует переданные аргументы (может прилететь event при использовании как onClick).
  const retry = useCallback(() => {
    void run(false);
  }, [run]);

  // refetch — тихий перефетч без скелета (фоновое обновление свежести данных).
  const refetch = useCallback(() => {
    void run(true);
  }, [run]);

  return { ...state, retry, refetch };
}
