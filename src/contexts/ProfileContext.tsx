import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getMyProfile, ApiException } from '../lib/api';
import type { UserProfile } from '../types/api';

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

export const ProfileProvider: React.FC<ProfileProviderProps> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMyProfile();
      setProfile(res.profile);
    } catch (err) {
      if (err instanceof ApiException && err.status === 401) {
        // Graceful fallback для dev-среды без Telegram
        setProfile(DEMO_PROFILE);
      } else {
        // Любая другая ошибка — используем демо
        setProfile(DEMO_PROFILE);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    } finally {
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
