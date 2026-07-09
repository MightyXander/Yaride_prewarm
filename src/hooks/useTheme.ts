import { useEffect, useState } from 'react';
import { isTelegramContext } from '../lib/auth';

/**
 * Режим темы: три значения (паритет с Android ThemeController).
 *  - 'light' / 'dark' — ручной выбор (хранится в localStorage);
 *  - 'system'         — следовать авто-источнику (Telegram colorScheme в реальном
 *                       Telegram-контексте, иначе prefers-color-scheme).
 */
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'yaride-theme';

/** Сохранённый ручной выбор → режим ('system', если ручного выбора нет). */
function readStoredMode(): ThemeMode {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s === 'light' || s === 'dark' ? s : 'system';
  } catch {
    return 'system';
  }
}

/** Разрешение авто-источника в конкретную тему. */
function resolveAuto(): 'light' | 'dark' {
  if (isTelegramContext() && window.Telegram?.WebApp) {
    return window.Telegram.WebApp.colorScheme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Тема оформления: ручной выбор (localStorage) приоритетнее авто-источника.
 * Вынесено из App.tsx (#290) — самодостаточный кусок, не зависящий от навигации.
 */
export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readStoredMode);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const m = readStoredMode();
    return m === 'system' ? resolveAuto() : m;
  });

  // Выбор режима: 'system' очищает ручной выбор и берёт авто-источник; иначе фиксирует.
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      if (mode === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* localStorage недоступен — просто не запоминаем */
    }
    setTheme(mode === 'system' ? resolveAuto() : mode);
  };

  // Быстрый тумблер (плавающая кнопка на корневых экранах): переключает light↔dark.
  const toggleTheme = () => setThemeMode(theme === 'light' ? 'dark' : 'light');

  // Применяем тема-класс к <html> для глобальной доступности CSS-переменных
  // (portaled-элементы ThemeToggle/BackButton/FloatingNav/ToastHost тоже их видят).
  useEffect(() => {
    document.documentElement.className = theme;
    // Снимаем anti-FOUC инлайн-фон (#0f0f12) из index.html — после применения
    // класса темы фоном должна управлять CSS-переменная --background, иначе
    // зарезервированный gutter скроллбара (scrollbar-gutter: stable) остаётся
    // чёрным поверх любой темы (#381).
    document.documentElement.style.backgroundColor = '';
    document.body.style.backgroundColor = '';
  }, [theme]);

  // Подписка на авто-источник: влияет на тему только в режиме 'system'
  // (ручной выбор не перетираем). Ветку определяем по реальному Telegram-контексту,
  // а не по простому наличию window.Telegram.WebApp (оно есть и в браузере).
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (isTelegramContext() && tg) {
      tg.ready();
      tg.expand();
      const handleThemeChange = () => {
        if (readStoredMode() === 'system') setTheme(tg.colorScheme);
      };
      handleThemeChange();
      tg.onEvent('themeChanged', handleThemeChange);
      return () => {
        tg.offEvent('themeChanged', handleThemeChange);
      };
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        if (readStoredMode() === 'system') setTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  return { theme, themeMode, setThemeMode, toggleTheme };
}
