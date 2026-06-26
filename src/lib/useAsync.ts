/**
 * Переиспользуемый хук для async-операций (API-вызовы).
 * Без привязки к конкретным экранам — для доменных воркеров.
 */

import { useState, useCallback } from 'react';
import { ApiException } from './api.ts';

export interface UseAsyncReturn<Data, Args extends unknown[]> {
  loading: boolean;
  data: Data | null;
  error: string | null;
  execute: (...args: Args) => Promise<void>;
  reset: () => void;
}

/**
 * Хук для async-операций с loading/data/error состоянием.
 *
 * @param asyncFn - Асинхронная функция (например, API-вызов)
 * @returns { loading, data, error, execute, reset }
 *
 * @example
 * const { loading, data, error, execute } = useAsync(
 *   (id: number) => getTrip(id)
 * );
 * // В компоненте: execute(tripId)
 */
export function useAsync<Data, Args extends unknown[]>(
  asyncFn: (...args: Args) => Promise<Data>,
): UseAsyncReturn<Data, Args> {
  const [state, setState] = useState<{
    loading: boolean;
    data: Data | null;
    error: string | null;
  }>({
    loading: false,
    data: null,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args) => {
      setState({ loading: true, data: null, error: null });
      try {
        const result = await asyncFn(...args);
        setState({ loading: false, data: result, error: null });
      } catch (err) {
        const message =
          err instanceof ApiException
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Неизвестная ошибка';
        setState({ loading: false, data: null, error: message });
      }
    },
    [asyncFn],
  );

  const reset = useCallback(() => {
    setState({ loading: false, data: null, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}
