/**
 * Персистенс «последнего экрана» между перезагрузками страницы (issue #392).
 * sessionStorage, а не localStorage: «где остановился» — свойство вкладки/сессии,
 * при новом открытии mini-app стартуем как раньше, без риска протухшего экрана.
 */
import type { Screen } from '../types/navigation';

const STORAGE_KEY = 'yaride_last_screen_v1';

export interface LastScreenEntry {
  screen: Screen;
  /** Только для screen === 'trip-details' — id поездки для дозагрузки. */
  tripId?: string;
}

/**
 * Экраны, которые можно показать сразу после reload без доп. контекста —
 * сами дозагружают свои данные (self-fetching), как и раньше при обычном заходе.
 */
const SELF_FETCHING_SCREENS: ReadonlySet<Screen> = new Set([
  'main',
  'profile',
  'my-trips',
  'my-cars',
  'my-alerts',
  'safety',
  'notifications',
]);

export function saveLastScreen(entry: LastScreenEntry): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // sessionStorage недоступен — игнорируем
  }
}

export function loadLastScreen(): LastScreenEntry | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as LastScreenEntry).screen !== 'string'
    ) {
      return null;
    }
    return parsed as LastScreenEntry;
  } catch {
    return null;
  }
}

export function clearLastScreen(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage недоступен — игнорируем
  }
}

/**
 * Приводит произвольный экран к восстановимому: сам экран (если self-fetching
 * или trip-details с известным tripId), иначе ближайший восстановимый родитель
 * по PARENT_SCREEN (useNavigation.ts), иначе 'main'. Экраны вне whitelist
 * (booking-*, request-published, rate-trip, auth-*, intro, шаги кода и т.п.)
 * никогда не возвращаются как есть.
 */
export function resolvePersistedEntry(
  screen: Screen,
  tripId: string | undefined,
  parentScreen: Record<Screen, Screen>
): LastScreenEntry {
  if (screen === 'trip-details') {
    return tripId ? { screen: 'trip-details', tripId } : { screen: 'main' };
  }
  if (SELF_FETCHING_SCREENS.has(screen)) {
    return { screen };
  }

  // Поднимаемся по дереву родителей до whitelist-экрана или trip-details.
  // visited страхует от циклов (напр. auth-gate → auth-gate).
  const visited = new Set<Screen>();
  let current = screen;
  while (!visited.has(current)) {
    visited.add(current);
    const parent = parentScreen[current];
    if (parent === undefined) break;
    if (parent === 'trip-details') {
      return tripId ? { screen: 'trip-details', tripId } : { screen: 'main' };
    }
    if (SELF_FETCHING_SCREENS.has(parent)) {
      return { screen: parent };
    }
    current = parent;
  }
  return { screen: 'main' };
}
