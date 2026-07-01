import { useState } from 'react';
import type { Screen } from '../types/navigation';

interface UseUserProfileNavArgs {
  currentScreen: Screen;
  navigate: (screen: Screen) => void;
  goBack: () => void;
}

/**
 * Стек просмотренных профилей (для user-profile): [userId0, userId1, ...].
 * Максимальная глубина 2 (корневой + 1 вложенный). Вынесено из App.tsx (#290).
 */
export function useUserProfileNav({ currentScreen, navigate, goBack }: UseUserProfileNavArgs) {
  const [profileStack, setProfileStack] = useState<number[]>([]);

  // Обработчики для user-profile навигации
  const handleOpenUserProfile = (userId: number) => {
    if (currentScreen !== 'user-profile') {
      // Первый вход в user-profile — создаём новый стек
      setProfileStack([userId]);
      navigate('user-profile');
    } else {
      // Уже в user-profile — добавляем в стек (если глубина < 2)
      setProfileStack((prev) => {
        if (prev.length >= 2) {
          // Глубина уже 2 — не добавляем
          return prev;
        }
        return [...prev, userId];
      });
    }
  };

  const handleUserProfileBack = () => {
    setProfileStack((prev) => {
      if (prev.length <= 1) {
        // Корневой уровень — выходим из user-profile
        goBack();
        return [];
      }
      // Снимаем верхний профиль
      return prev.slice(0, -1);
    });
  };

  return { profileStack, handleOpenUserProfile, handleUserProfileBack };
}
