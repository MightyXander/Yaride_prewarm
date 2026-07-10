/**
 * Персистенс «последнего экрана» между перезагрузками страницы (issue #392, #402).
 * localStorage, а не sessionStorage: в Telegram WebView перезагрузка пересоздаёт
 * browsing context и обнуляет sessionStorage, поэтому восстановление там не работало.
 * «Reload vs новый запуск» различаем по свежести ts (см. FRESHNESS_MS ниже) —
 * это и есть эквивалент «сессии» без завязки на sessionStorage.
 */
import type { Screen } from '../types/navigation';

const STORAGE_KEY = 'yaride_last_screen_v2';
/** Старый ключ issue #392 (sessionStorage) — чистим при старте, дальше не используется. */
const LEGACY_STORAGE_KEY_V1 = 'yaride_last_screen_v1';

/**
 * Запись считается «свежей» (reload той же сессии), если с последнего обновления
 * ts прошло меньше этого окна. 30с покрывает любой обычный reload, включая
 * медленный холодный старт Telegram WebView. Старше — трактуем как новый запуск
 * после паузы и стартуем на main.
 */
const FRESHNESS_MS = 30_000;

export interface LastScreenEntry {
  screen: Screen;
  /** Только для screen === 'trip-details' — id поездки для дозагрузки. */
  tripId?: string;
  /** Unix ms последнего обновления записи — используется для freshness-проверки. */
  ts: number;
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

export function saveLastScreen(entry: Omit<LastScreenEntry, 'ts'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...entry, ts: Date.now() }));
  } catch {
    // localStorage недоступен — игнорируем
  }
}

/**
 * Перезаписывает ts текущей сохранённой записи, не трогая screen/tripId
 * (heartbeat из useNavigation.ts). Если записи ещё нет — ничего не делает.
 */
export function touchLastScreen(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as LastScreenEntry).screen !== 'string') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...(parsed as LastScreenEntry), ts: Date.now() }));
  } catch {
    // localStorage недоступен — игнорируем
  }
}

export function loadLastScreen(): LastScreenEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as LastScreenEntry).screen !== 'string' ||
      typeof (parsed as LastScreenEntry).ts !== 'number'
    ) {
      return null;
    }
    const entry = parsed as LastScreenEntry;
    // Протухшая запись (новый запуск после паузы, не reload) — не восстанавливаем.
    if (Date.now() - entry.ts >= FRESHNESS_MS) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function clearLastScreen(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage недоступен — игнорируем
  }
}

/**
 * Чистит старый sessionStorage-ключ v1 (issue #392) — вызывается один раз при
 * старте приложения. sessionStorage сам по себе не переживает reload в Telegram
 * WebView, поэтому эта запись в любом случае мусор, но лучше явно убрать.
 */
export function clearLegacyLastScreen(): void {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY_V1);
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
): Omit<LastScreenEntry, 'ts'> {
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
