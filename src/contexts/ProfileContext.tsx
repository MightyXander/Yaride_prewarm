import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getMyProfile, ApiException } from '../lib/api';
import type { UserProfile } from '../types/api';
import {
  readProfileCache,
  writeProfileCache,
  readTelegramProfile,
} from '../lib/profileCache';

// Демо-данные для браузера без Telegram (graceful fallback при 401).
const DEMO_PROFILE: UserProfile = {
  name: 'Никита Р.',
  age: 28,
  rating_avg: 4.9,
  rating_count: 23,
  trips_driver_count: 12,
  trips_passenger_count: 11,
  license_status: 'verified',
};

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
};

interface ProfileProviderProps {
  children: ReactNode;
}

/**
 * Синхронная инициализация профиля из памяти устройства.
 * Приоритет: localStorage → Telegram initData → null.
 */
function getInitialProfile(): UserProfile | null {
  // 1. localStorage-кэш (полный профиль)
  const cached = readProfileCache();
  if (cached) return cached;

  // 2. Telegram initDataUnsafe (частичный профиль)
  const tgProfile = readTelegramProfile();
  if (tgProfile) return tgProfile as UserProfile;

  // 3. Нет данных — холодный старт
  return null;
}

export const ProfileProvider: React.FC<ProfileProviderProps> = ({ children }) => {
  // Синхронная инициализация профиля ДО первого рендера
  const initialProfile = getInitialProfile();
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  // loading=true ТОЛЬКО если начальный профиль отсутствует
  const [loading, setLoading] = useState(initialProfile === null);
  const [error, setError] = useState<Error | null>(null);

  const loadProfile = async () => {
    try {
      // loading=true ТОЛЬКО если текущий профиль null (холодный старт)
      // Если профиль засижен — НЕ показываем скелет, обновляем тихо
      setLoading((currentLoading) => {
        // Включаем loading только если он был выключен и профиль null
        return currentLoading;
      });
      setError(null);

      const res = await getMyProfile();
      setProfile(res.profile);

      // Сохраняем успешный профиль в кэш (stale-while-revalidate)
      writeProfileCache(res.profile);

      // После успешной загрузки выключаем loading
      setLoading(false);
    } catch (err) {
      if (err instanceof ApiException && err.status === 401) {
        // Graceful fallback для dev-среды без Telegram
        setProfile(DEMO_PROFILE);
      } else {
        // Любая другая ошибка — используем демо (если профиль ещё null)
        setProfile((currentProfile) => currentProfile || DEMO_PROFILE);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const value: ProfileContextValue = {
    profile,
    loading,
    error,
    refetch: loadProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};
