import { useState, useEffect, useCallback, useRef } from 'react';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { getScreenData, setScreenData, prefetchScreenData } from '../lib/screenDataCache';

export interface UseScreenDataResult<T> {
  data: T | undefined;
  loading: boolean;
  error: boolean;
  refetch: (silent?: boolean) => Promise<void>;
  mutate: (updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * SWR-подобный хук для подстраниц профиля/уведомлений (issue #352).
 *
 * Кэш есть (screenDataCache) → data доступна сразу, loading=false, в фоне
 * тихий revalidate (без мигания скелета). Кэша нет → обычная загрузка
 * (loading=true до ответа), сам фетч идёт через prefetchScreenData —
 * дедуплицируется с любым уже летящим префетчем того же key (напр. прогрев
 * из ProfileScreen). useRefetchOnFocus встроен: возврат фокуса/видимости
 * вкладки тихо освежает данные без отдельной подписки на каждом экране.
 */
export function useScreenData<T>(key: string, fetcher: () => Promise<T>): UseScreenDataResult<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | undefined>(() => getScreenData<T>(key));
  const [loading, setLoading] = useState<boolean>(() => getScreenData<T>(key) === undefined);
  const [error, setError] = useState(false);

  const load = useCallback(async (loadKey: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const result = await prefetchScreenData(loadKey, fetcherRef.current);
      setData(result);
    } catch (err) {
      console.error(`[useScreenData:${loadKey}] ошибка загрузки:`, err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getScreenData<T>(key);
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
      // Кэш уже есть — контент показан мгновенно, тихо освежаем в фоне.
      void load(key, true);
    } else {
      setData(undefined);
      setLoading(true);
      void load(key, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useRefetchOnFocus(() => {
    void load(key, true);
  });

  const mutate = useCallback(
    (updater: T | ((prev: T | undefined) => T)) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? (updater as (prev: T | undefined) => T)(prev) : updater;
        setScreenData(key, next);
        return next;
      });
    },
    [key],
  );

  const refetch = useCallback((silent = false) => load(key, silent), [key, load]);

  return { data, loading, error, refetch, mutate };
}

/**
 * Анти-флеш (issue #352, развилка №3): скелетон показываем только если
 * `active` держится дольше `ms`. Быстрый ответ (данные подоспели раньше
 * порога) — контент появляется сразу через Appear, скелетон не мигает вовсе.
 */
export function useDelayedFlag(active: boolean, ms = 180): boolean {
  const [flag, setFlag] = useState(false);

  useEffect(() => {
    if (!active) {
      setFlag(false);
      return;
    }
    const timer = window.setTimeout(() => setFlag(true), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);

  return flag;
}
