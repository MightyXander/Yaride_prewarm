import type { UserProfile } from '../types/api';

const CACHE_KEY = 'yaride_profile_v1';

interface CachedProfile {
  profile: UserProfile;
  timestamp: number;
}

/**
 * Синхронно читает профиль из localStorage.
 * Возвращает null, если кэш отсутствует, битый или устарел.
 */
export function readProfileCache(): UserProfile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached: CachedProfile = JSON.parse(raw);

    // Валидация структуры
    if (
      !cached.profile ||
      typeof cached.profile.name !== 'string' ||
      typeof cached.profile.rating_avg !== 'number'
    ) {
      return null;
    }

    return cached.profile;
  } catch {
    // Битый JSON или отсутствие localStorage
    return null;
  }
}

/**
 * Сохраняет профиль в localStorage.
 */
export function writeProfileCache(profile: UserProfile): void {
  try {
    const cached: CachedProfile = {
      profile,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage недоступен или переполнен — игнорируем
  }
}

/**
 * Синхронно извлекает частичный профиль из Telegram initDataUnsafe.
 * Возвращает null, если Telegram WebApp недоступен или данные отсутствуют.
 */
export function readTelegramProfile(): Partial<UserProfile> | null {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initDataUnsafe?.user) return null;

    const user = tg.initDataUnsafe.user;

    // Собираем имя
    let name = user.first_name || '';
    if (user.last_name) {
      name += ` ${user.last_name}`;
    }
    if (!name.trim()) return null;

    // Возвращаем частичный профиль (без рейтинга/поездок)
    return {
      name: name.trim(),
      age: null,
      rating_avg: 0,
      rating_count: 0,
      trips_driver_count: 0,
      trips_passenger_count: 0,
      license_status: 'unverified',
    };
  } catch {
    return null;
  }
}
