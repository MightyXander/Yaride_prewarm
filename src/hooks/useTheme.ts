import { useEffect, useState } from 'react';
import { isTelegramContext } from '../lib/auth';

/**
 * Тема оформления: ручной выбор (localStorage) приоритетнее авто-источника
 * (Telegram colorScheme в реальном Telegram-контексте, иначе prefers-color-scheme).
 * Вынесено из App.tsx (#290) — самодостаточный кусок, не зависящий от навигации.
 */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Ручной выбор темы (кнопка на главной) имеет приоритет над авто-определением.
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('yaride-theme') : null;
    if (stored === 'light' || stored === 'dark') return stored;
    // Баг ревью #5: тему из Telegram берём только в реальном Telegram-контексте.
    // В браузере (где window.Telegram.WebApp существует, но platform='unknown')
    // используем prefers-color-scheme, иначе тема залипает на дефолте Telegram.
    if (isTelegramContext() && window.Telegram?.WebApp) {
      return window.Telegram.WebApp.colorScheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Переключение темы вручную + запоминание выбора.
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('yaride-theme', next);
      } catch {
        /* localStorage недоступен — просто не запоминаем */
      }
      return next;
    });
  };

  // Применяем тема-класс к <html> для глобальной доступности CSS-переменных
  // (portaled-элементы ThemeToggle/BackButton/FloatingNav/ToastHost тоже их видят).
  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    // Если пользователь уже выбрал тему вручную — не перетираем её авто-источником.
    const hasManual = () => {
      try {
        const s = localStorage.getItem('yaride-theme');
        return s === 'light' || s === 'dark';
      } catch {
        return false;
      }
    };
    // Баг ревью #5: ветку выбора темы определяем по реальному Telegram-контексту,
    // а не по простому наличию window.Telegram.WebApp (которое есть и в браузере).
    const tg = window.Telegram?.WebApp;
    if (isTelegramContext() && tg) {
      tg.ready();
      tg.expand();
      if (!hasManual()) setTheme(tg.colorScheme);

      const handleThemeChange = () => {
        if (!hasManual()) setTheme(tg.colorScheme);
      };
      tg.onEvent('themeChanged', handleThemeChange);

      return () => {
        tg.offEvent('themeChanged', handleThemeChange);
      };
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        if (!hasManual()) setTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  return { theme, toggleTheme };
}
