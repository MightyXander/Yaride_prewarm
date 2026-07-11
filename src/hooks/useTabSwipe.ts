import { useRef, useCallback } from 'react';
import type React from 'react';
import type { Screen } from '../types/navigation';
import type { TabRoot } from './useNavigation';

// Карусельный свайп между разделами: live-scrub со сквозным непрерывным offset
// (issue #422, паритет с Android PageController). Хук — «репортер» горизонтального
// пана: сообщает App долю сдвига пальца (dxFraction = (x−x0)/ширина) и скорость
// флика; всю модель offset, клэмп, выбор цели и доводку держит App. Хук отвечает
// за: touch-only, экраны-разделы, guard карточек уведомлений (свайп-удаление),
// горизонтальную доминанту (ранний выигрыш у вертикального скролла), окно скорости,
// отмену (браузер забрал жест под скролл).

const HORIZONTAL_DOMINANCE = 1.5; // |dx| > 1.5·|dy| — старт скраба (границы #422)
const SCRUB_ACTIVATION_PX = 10; // анти-дребезг тапа
const VELOCITY_WINDOW_MS = 100; // окно усреднения скорости флика (сглаживает коалесценцию move-ов)

// Экраны, на которых жест активен: корни разделов + их «братья» внутри раздела.
// Flow-экраны (детали поездки и т.д.) и auth — не участвуют. Экспортируется — App
// включает caret-scrub навбара на тех же экранах (issue #422).
export const SWIPE_SCREENS: Screen[] = ['notifications', 'main', 'main-more', 'evening-main', 'profile'];

// Раздел карусели для экрана. Экспортируется — App держит ту же принадлежность.
export const SCREEN_TAB: Partial<Record<Screen, TabRoot>> = {
  notifications: 'notifications',
  main: 'main',
  'main-more': 'main',
  'evening-main': 'main',
  profile: 'profile',
};
// Порядок разделов: индекс == позиция offset (0 — уведомления, 1 — главная, 2 — профиль).
export const TAB_ORDER: TabRoot[] = ['notifications', 'main', 'profile'];

interface UseTabSwipeArgs {
  currentScreen: Screen;
  /** Реальный touch-жест начат (после guard'ов): App метит новый жест (handoff
   *  идущей доводки делает первый активированный move). */
  onGestureStart: () => void;
  /** Горизонтальный пан после подтверждения доминанты: dxFraction = (x−x0)/ширина,
   *  знак +вправо/−влево. App: offset = base − dxFraction. */
  onScrubMove: (dxFraction: number) => void;
  /** Палец отпущен/жест сорван: velocityFraction = скорость_x/ширина (доля/мс,
   *  +вправо), cancelled — браузер забрал жест под вертикальный скролл. */
  onScrubEnd: (info: { velocityFraction: number; cancelled: boolean }) => void;
}

/**
 * Pointer-обработчики для обёртки screenTransition в App.tsx. Только touch. Свайп,
 * начатый на карточке уведомления ([data-swipe-card]), не стартует — карточка ведёт
 * свой drag удаления (#337). Вертикальный скролл не перехватываем (preventDefault
 * не зовём); ранний выигрыш у скролла — по горизонтальной доминанте (issue #420);
 * если браузер забрал жест под скролл — pointercancel → onScrubEnd(cancelled).
 */
export function useTabSwipe({ currentScreen, onGestureStart, onScrubMove, onScrubEnd }: UseTabSwipeArgs) {
  // Стартовая точка активного touch-жеста; null — жест не начат/сброшен.
  const startRef = useRef<{ x: number; y: number; pointerId: number; width: number } | null>(null);
  // Доминанта подтверждена — скраб репортится (до этого только копим точки).
  const activatedRef = useRef(false);
  // Скользящее окно точек за последние VELOCITY_WINDOW_MS — скорость флика по окну
  // (как VelocityTracker в Android), а не по последней паре: браузер коалесцирует.
  const samplesRef = useRef<{ x: number; t: number }[]>([]);

  const resetGesture = useCallback(() => {
    startRef.current = null;
    activatedRef.current = false;
    samplesRef.current = [];
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!SWIPE_SCREENS.includes(currentScreen)) return;
      // Жест начат на карточке уведомления — раздел не скрабим (свайп-удаление).
      if ((e.target as Element).closest('[data-swipe-card]')) return;
      resetGesture();
      const width = (e.currentTarget as HTMLElement).clientWidth || window.innerWidth;
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, width };
      samplesRef.current = [{ x: e.clientX, t: e.timeStamp }];
      onGestureStart();
    },
    [currentScreen, resetGesture, onGestureStart]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || start.pointerId !== e.pointerId) return;

      const samples = samplesRef.current;
      samples.push({ x: e.clientX, t: e.timeStamp });
      while (samples.length > 1 && e.timeStamp - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!activatedRef.current) {
        // Ждём подтверждения горизонтальной доминанты (иначе отдаём вертикали).
        if (Math.abs(dx) < SCRUB_ACTIVATION_PX || Math.abs(dx) <= HORIZONTAL_DOMINANCE * Math.abs(dy)) return;
        activatedRef.current = true;
      }
      onScrubMove(dx / start.width);
    },
    [onScrubMove]
  );

  // Скорость по окну: включаем точку отпускания, отбрасываем старше окна — пауза
  // перед отпусканием естественно обнуляет скорость (окно схлопывается до up-точки).
  const windowVelocityFraction = useCallback((upX: number, upT: number, width: number) => {
    const samples = samplesRef.current;
    samples.push({ x: upX, t: upT });
    while (samples.length > 1 && upT - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
    const first = samples[0];
    const last = samples[samples.length - 1];
    const spanMs = last.t - first.t;
    return spanMs > 0 ? (last.x - first.x) / spanMs / width : 0; // доля/мс, +вправо
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || start.pointerId !== e.pointerId) return;
      const activated = activatedRef.current;
      const velocityFraction = windowVelocityFraction(e.clientX, e.timeStamp, start.width);
      resetGesture();
      if (activated) onScrubEnd({ velocityFraction, cancelled: false });
    },
    [onScrubEnd, resetGesture, windowVelocityFraction]
  );

  // Браузер забрал жест (напр. под вертикальный скролл) — активный скраб откатываем.
  const onPointerCancel = useCallback(() => {
    const activated = activatedRef.current;
    resetGesture();
    if (activated) onScrubEnd({ velocityFraction: 0, cancelled: true });
  }, [onScrubEnd, resetGesture]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
