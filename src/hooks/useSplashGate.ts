import { useEffect, useState } from 'react';

interface UseSplashGateArgs {
  meChecked: boolean;
  prewarmDone: boolean;
  routePointsStatus: string;
  morningStatus: string;
  eveningStatus: string;
}

/**
 * Splash уходит как только данные готовы (дав лого ~0.6с проявиться),
 * но не позже ~6с — жёсткий cap на медленных/зависших данных (2.5с→6с в issue #466:
 * гейт дополнительно ждёт prewarmDone — прогрев экранов глубины ≤2; по таймауту
 * открываемся, прогрев доезжает фоном).
 * Вынесено из App.tsx (#290); зависимости эффекта — те же примитивы (status-строки),
 * что и в исходнике, чтобы не менять частоту срабатывания.
 */
export function useSplashGate({ meChecked, prewarmDone, routePointsStatus, morningStatus, eveningStatus }: UseSplashGateArgs) {
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashHiding, setSplashHiding] = useState(false);

  useEffect(() => {
    if (!splashVisible) return;

    // Готовность данных: ни один источник не в loading/idle И проверена сессия
    // (meChecked) И прогреты экраны глубины ≤2 (prewarmDone, issue #466) — чтобы
    // первый кадр после splash не мигал гейтом до ответа /me и любой переход
    // с первого кадра был мгновенным.
    const dataReady =
      meChecked &&
      prewarmDone &&
      routePointsStatus !== 'loading' &&
      routePointsStatus !== 'idle' &&
      morningStatus !== 'loading' &&
      morningStatus !== 'idle' &&
      eveningStatus !== 'loading' &&
      eveningStatus !== 'idle';

    // Потолок: уйти не позже ~6с в любом случае (прогрев доедет фоном).
    const capTimer = setTimeout(() => setSplashHiding(true), 6000);
    // Данные готовы — уходим раньше (минимальный показ ~0.6с под анимацию лого).
    const readyTimer = dataReady ? setTimeout(() => setSplashHiding(true), 600) : undefined;

    return () => {
      clearTimeout(capTimer);
      if (readyTimer) clearTimeout(readyTimer);
    };
  }, [routePointsStatus, morningStatus, eveningStatus, splashVisible, meChecked, prewarmDone]);

  return { splashVisible, splashHiding, setSplashVisible };
}
