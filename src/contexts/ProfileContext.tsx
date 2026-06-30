import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getMyProfile, ApiException } from '../lib/api';
import type { UserProfile } from '../types/api';
import {
  readProfileCache,
  writeProfileCache,
  readTelegramProfile,
} from '../lib/profileCache';

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
  /** true, если профиль недоступен из-за отсутствия авторизации Telegram (401). */
  needsTelegram: boolean;
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
  const [needsTelegram, setNeedsTelegram] = useState(false);

  const loadProfile = async () => {
    try {
      // loading=true ТОЛЬКО если текущий профиль null (холодный старт)
      // Если профиль засижен — НЕ показываем скелет, обновляем тихо
      setLoading((currentLoading) => {
        // Включаем loading только если он был выключен и профиль null
        return currentLoading;
      });
      setError(null);
      setNeedsTelegram(false);

      const res = await getMyProfile();
      setProfile(res.profile);

      // Сохраняем успешный профиль в кэш (stale-while-revalidate)
      writeProfileCache(res.profile);

      // После успешной загрузки выключаем loading
      setLoading(false);
    } catch (err) {
      if (err instanceof ApiException && err.status === 401) {
        // Вне Telegram (нет авторизации) — НЕ показываем выдуманный профиль.
        // Честное состояние: «Открой в Telegram». Засиженный реальный профиль
        // из кэша/initData (если есть) оставляем как есть.
        setNeedsTelegram(true);
      } else {
        // Иная ошибка загрузки — отдаём honest error (как другие экраны).
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
    needsTelegram,
    refetch: loadProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};
