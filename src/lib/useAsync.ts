/**
 * Лёгкий хук для управления асинхронным состоянием (loading/data/error).
 * Без привязки к экранам — переиспользуемый для доменных воркеров.
 */

import { useState, useCallback } from 'react';
import { ApiException } from './api.ts';

export interface AsyncState<T> {
  loading: boolean;
  data: T | null;
  error: string | null;
}

export interface UseAsyncResult<T, Args extends unknown[]> extends AsyncState<T> {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
}

/**
 * Хук для управления состоянием асинхронной операции.
 *
 * @param asyncFn - асинхронная функция для выполнения
 * @returns объект с состоянием (loading, data, error) и методами (execute, reset)
 *
 * @example
 * const trips = useAsync(getTrips);
 *
 * // В useEffect или обработчике:
 * trips.execute({ window: 'morning' });
 *
 * // В рендере:
 * if (trips.loading) return <Spinner />;
 * if (trips.error) return <Error message={trips.error} />;
 * return <TripList data={trips.data} />;
 */
export function useAsync<T, Args extends unknown[]>(
  asyncFn: (...args: Args) => Promise<T>,
): UseAsyncResult<T, Args> {
  const [state, setState] = useState<AsyncState<T>>({
    loading: false,
    data: null,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState({ loading: true, data: null, error: null });
      try {
        const result = await asyncFn(...args);
        setState({ loading: false, data: result, error: null });
        return result;
      } catch (err) {
        let errorMessage: string;
        if (err instanceof ApiException) {
          errorMessage = err.message;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        } else {
          errorMessage = 'Неизвестная ошибка';
        }
        setState({ loading: false, data: null, error: errorMessage });
        return null;
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
