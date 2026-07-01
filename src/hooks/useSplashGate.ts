import { useEffect, useState } from 'react';

interface UseSplashGateArgs {
  meChecked: boolean;
  routePointsStatus: string;
  morningStatus: string;
  eveningStatus: string;
}

/**
 * Splash уходит как только данные готовы (дав лого ~0.6с проявиться),
 * но не позже ~2.5с — жёсткий cap на медленных/зависших данных.
 * Вынесено из App.tsx (#290); зависимости эффекта — те же примитивы (status-строки),
 * что и в исходнике, чтобы не менять частоту срабатывания.
 */
export function useSplashGate({ meChecked, routePointsStatus, morningStatus, eveningStatus }: UseSplashGateArgs) {
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashHiding, setSplashHiding] = useState(false);

  useEffect(() => {
    if (!splashVisible) return;

    // Готовность данных: ни один источник не в loading/idle И проверена сессия
    // (meChecked) — чтобы первый кадр после splash не мигал гейтом до ответа /me.
    const dataReady =
      meChecked &&
      routePointsStatus !== 'loading' &&
      routePointsStatus !== 'idle' &&
      morningStatus !== 'loading' &&
      morningStatus !== 'idle' &&
      eveningStatus !== 'loading' &&
      eveningStatus !== 'idle';

    // Потолок: уйти не позже ~2.5с в любом случае.
    const capTimer = setTimeout(() => setSplashHiding(true), 2500);
    // Данные готовы — уходим раньше (минимальный показ ~0.6с под анимацию лого).
    const readyTimer = dataReady ? setTimeout(() => setSplashHiding(true), 600) : undefined;

    return () => {
      clearTimeout(capTimer);
      if (readyTimer) clearTimeout(readyTimer);
    };
  }, [routePointsStatus, morningStatus, eveningStatus, splashVisible, meChecked]);

  return { splashVisible, splashHiding, setSplashVisible };
}
