/**
 * screenDataCache — Map-кэш данных подстраниц профиля/уведомлений на время
 * сессии mini-app (issue #352). Цель: повторный заход на «Мои поездки»/«Мои
 * машины»/«Мои заявки»/«Безопасность»/«Уведомления»/публичный профиль не
 * должен мигать скелетоном — контент показывается сразу из кэша, а свежие
 * данные подтягиваются тихим revalidate (см. useScreenData).
 *
 * НЕ localStorage: данные подстраниц изменчивы и приватны, а сессии mini-app
 * короткие — module-level Map, живущий, пока открыта вкладка. localStorage
 * остаётся только у профиля целиком (src/lib/profileCache.ts), как и раньше.
 */

const cache = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

/** Синхронно читает значение из кэша. undefined — кэша ещё нет (холодный старт). */
export function getScreenData<T>(key: string): T | undefined {
  return cache.has(key) ? (cache.get(key) as T) : undefined;
}

/** Пишет значение в кэш — используется мутациями экранов и revalidate-фетчами. */
export function setScreenData<T>(key: string, value: T): void {
  cache.set(key, value);
}

/**
 * Запускает `fetcher`, кладёт результат в кэш и возвращает его. Параллельные
 * вызовы с одним `key` (например, префетч из ProfileScreen и почти
 * одновременный маунт самого экрана «Мои машины») переиспользуют один и тот
 * же in-flight промис — второй сетевой запрос не уходит. Ошибка не кладётся
 * в кэш (следующий вызов начнёт фетч заново).
 */
export function prefetchScreenData<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher()
    .then((result) => {
      cache.set(key, result);
      return result;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
