/**
 * appPrefetch — глубинно-ориентированный прогрев экранов (issue #466, заменяет
 * idle-прогрев фиксированного списка из #414). «Прогрет» = вызвана import-фабрика
 * код-чанка экрана (screenChunkLoaders) + prefetchScreenData для всех его
 * фетчеров; экраны без данных — только чанк.
 *
 * Дерево экранов НЕ дублируется: CHILD_SCREENS — инверсия PARENT_SCREEN из
 * useNavigation.ts, вычисляется один раз на модульном уровне.
 *
 * Два режима:
 * - prewarmInitial(screen) — стартовый прогрев потомков глубины ≤2 параллельно
 *   (concurrency 4, без стаггера): splash ждёт его через prewarmDone
 *   (useSplashGate), затягивать нельзя.
 * - prewarmAround(screen) — фоновая догрузка после навигации: requestIdleCallback
 *   (fallback setTimeout 2s) + стаггер 250ms из вежливости к серверу.
 *
 * Повторный прогрев дешёвый: module-level Set прогретых чанков + дедупликация
 * prefetchScreenData (in-flight + кэш). Ошибки глотаются per-screen: реальный
 * заход на экран начнёт фетч заново (prefetchScreenData ошибки не кэширует).
 */
import { PARENT_SCREEN } from '../hooks/useNavigation';
import { screenChunkLoaders } from './screenRegistry';
import { getScreenData, prefetchScreenData } from './screenDataCache';
import {
  fetchMyTripsUpcoming,
  fetchMyTripsPast,
  fetchMyCars,
  fetchMyAlerts,
  fetchSafety,
  fetchNotifications,
} from './screenFetchers';
import type { Screen } from '../types/navigation';

/** Пауза между префетчами в фоновом режиме — стаггер очереди. */
const STAGGER_MS = 250;

/** Кап глубины обхода от текущего экрана. */
const MAX_DEPTH = 2;

/** Параллелизм стартового прогрева. */
const INITIAL_CONCURRENCY = 4;

/**
 * Прямой граф экранов: parent → children. Инверсия PARENT_SCREEN («назад»-графа
 * из useNavigation) — единственного источника структуры дерева. Самоссылки
 * корней ('auth-gate', 'intro') отбрасываются, иначе обход зациклился бы.
 */
const CHILD_SCREENS: Partial<Record<Screen, Screen[]>> = (() => {
  const map: Partial<Record<Screen, Screen[]>> = {};
  for (const [child, parent] of Object.entries(PARENT_SCREEN) as [Screen, Screen][]) {
    if (child === parent) continue;
    (map[parent] ??= []).push(child);
  }
  return map;
})();

/**
 * Данные экранов со статическими ключами кэша (useScreenData на самих экранах
 * использует ровно эти же ключи — иначе прогрев мимо). Экраны с динамическими
 * фетчерами (user-profile/trip-details: нужен id) прогреваются только чанком.
 */
const SCREEN_FETCHERS: Partial<Record<Screen, Array<{ key: string; fetcher: () => Promise<unknown> }>>> = {
  notifications: [{ key: 'notifications', fetcher: fetchNotifications }],
  'my-trips': [
    { key: 'my-trips:upcoming', fetcher: fetchMyTripsUpcoming },
    { key: 'my-trips:past', fetcher: fetchMyTripsPast },
  ],
  'my-cars': [{ key: 'my-cars', fetcher: fetchMyCars }],
  'my-alerts': [{ key: 'my-alerts', fetcher: fetchMyAlerts }],
  safety: [{ key: 'safety', fetcher: fetchSafety }],
};

/** Чанки, чья import-фабрика уже вызвана (модуль в module registry браузера). */
const warmedChunks = new Set<Screen>();

/** Потомки screen на глубину ≤ maxDepth (BFS, сам screen не входит). */
export function collectDescendants(screen: Screen, maxDepth: number = MAX_DEPTH): Screen[] {
  const result: Screen[] = [];
  const seen = new Set<Screen>([screen]);
  let frontier: Screen[] = [screen];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: Screen[] = [];
    for (const s of frontier) {
      for (const child of CHILD_SCREENS[s] ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        result.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  return result;
}

/**
 * Прогревает один экран: чанк + данные. Возвращает true, если реально ушла
 * хоть одна асинхронная работа (для пропуска стаггер-паузы в фоне).
 */
async function warmScreen(screen: Screen): Promise<boolean> {
  const tasks: Promise<unknown>[] = [];

  const loadChunk = screenChunkLoaders[screen as keyof typeof screenChunkLoaders];
  if (loadChunk && !warmedChunks.has(screen)) {
    warmedChunks.add(screen);
    tasks.push(
      loadChunk().catch(() => {
        // Сеть подвела — снимаем пометку, следующий прогрев/заход попробует снова.
        warmedChunks.delete(screen);
      }),
    );
  }

  for (const { key, fetcher } of SCREEN_FETCHERS[screen] ?? []) {
    if (getScreenData(key) !== undefined) continue;
    tasks.push(
      prefetchScreenData(key, fetcher).catch(() => {
        // per-screen: ошибка не валит прогрев, реальный заход повторит фетч.
      }),
    );
  }

  if (tasks.length === 0) return false;
  await Promise.all(tasks);
  return true;
}

/**
 * Стартовый прогрев: все потомки screen глубины ≤2, параллельно с concurrency 4,
 * без стаггера (splash ждёт prewarmDone — затягивать нельзя). Промис резолвится,
 * когда прогреты все цели (ошибки проглочены внутри warmScreen).
 */
export async function prewarmInitial(screen: Screen): Promise<void> {
  const targets = collectDescendants(screen);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < targets.length) {
      const target = targets[nextIndex];
      nextIndex += 1;
      await warmScreen(target);
    }
  };
  const workers = Array.from({ length: Math.min(INITIAL_CONCURRENCY, targets.length) }, worker);
  await Promise.all(workers);
}

/**
 * Фоновая догрузка после навигации: потомки screen глубины ≤2, последовательно
 * в idle-время со стаггером 250ms. Fire-and-forget: отмены нет — повторный
 * вызов на уже прогретом поддереве дешёвый (Set чанков + дедуп данных).
 */
export function prewarmAround(screen: Screen): void {
  const run = async (): Promise<void> => {
    for (const target of collectDescendants(screen)) {
      const didWork = await warmScreen(target);
      if (didWork) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STAGGER_MS);
        });
      }
    }
  };

  const win = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  if (win.requestIdleCallback) {
    win.requestIdleCallback(() => {
      void run();
    });
    return;
  }
  // Safari: requestIdleCallback нет — не блокируем первый рендер таймаутом.
  window.setTimeout(() => {
    void run();
  }, 2000);
}
