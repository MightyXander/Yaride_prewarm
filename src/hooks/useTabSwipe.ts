import { useRef, useCallback } from 'react';
import type React from 'react';
import type { Screen } from '../types/navigation';
import type { TabRoot } from './useNavigation';

// Карусельный свайп между разделами (issue #415): триггер-жест с порогом,
// НЕ pixel-scrub — палец не тянет экраны вживую, по завершении жеста
// переключаем соседний раздел с полноэкранным слайдом (switchTab).

// Порог дистанции по X (px) и коэффициент горизонтальной доминанты (|dx| > 1.5·|dy|).
const SWIPE_DISTANCE_PX = 60;
const HORIZONTAL_DOMINANCE = 1.5;

// Экраны, на которых жест активен: корни разделов + их «братья» внутри раздела.
// Flow-экраны (детали поездки, публикация и т.д.) и auth — не участвуют.
const SWIPE_SCREENS: Screen[] = ['notifications', 'main', 'main-more', 'evening-main', 'profile'];

// Раздел карусели для экрана (индекс в TAB_ORDER: notifications(0) — main(1) — profile(2)).
const SCREEN_TAB: Partial<Record<Screen, TabRoot>> = {
  notifications: 'notifications',
  main: 'main',
  'main-more': 'main',
  'evening-main': 'main',
  profile: 'profile',
};
const TAB_ORDER: TabRoot[] = ['notifications', 'main', 'profile'];

interface UseTabSwipeArgs {
  currentScreen: Screen;
  switchTab: (target: TabRoot) => void;
}

/**
 * Pointer-обработчики для обёртки screenTransition в App.tsx.
 * Только touch; свайп влево — следующий раздел справа (main → profile),
 * вправо — предыдущий; на краях (notifications ←, profile →) — ничего.
 * Свайп, начатый на карточке уведомления ([data-swipe-card]), не стартует —
 * карточка обрабатывает свой drag-жест удаления (#337).
 * Вертикальный скролл не перехватываем: preventDefault не зовём вовсе,
 * решение принимается по горизонтальной доминанте прямо в pointermove
 * (issue #420): как только |dx| ≥ 60px и доминанта подтверждена — переключаем
 * раздел сразу, не дожидаясь отпускания пальца; жест после срабатывания
 * считается потреблённым до конца сессии (одно срабатывание за жест);
 * если браузер забирает жест под скролл — придёт pointercancel и жест сброшен.
 */
export function useTabSwipe({ currentScreen, switchTab }: UseTabSwipeArgs) {
  // Стартовая точка активного touch-жеста; null — жест не начат/сброшен/потреблён.
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  // Общая проверка порога и вычисление цели; null — порог не пересечён или край карусели.
  const resolveTarget = useCallback(
    (dx: number, dy: number): TabRoot | null => {
      // Порог дистанции + горизонтальная доминанта — иначе это тап или скролл.
      if (Math.abs(dx) < SWIPE_DISTANCE_PX || Math.abs(dx) <= HORIZONTAL_DOMINANCE * Math.abs(dy)) return null;
      const currentTab = SCREEN_TAB[currentScreen];
      if (!currentTab) return null;
      // Свайп влево (dx < 0) — раздел справа (индекс +1), вправо — слева (−1).
      const targetIndex = TAB_ORDER.indexOf(currentTab) + (dx < 0 ? 1 : -1);
      // Края карусели не зациклены: за пределами порядка — ничего.
      return TAB_ORDER[targetIndex] ?? null;
    },
    [currentScreen]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!SWIPE_SCREENS.includes(currentScreen)) return;
      // Жест начат на карточке уведомления — раздел не переключаем,
      // карточка обрабатывает собственный drag (свайп-удаление).
      if ((e.target as Element).closest('[data-swipe-card]')) return;
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    },
    [currentScreen]
  );

  // Срабатывание порога в движении (issue #420): переключаем раздел, не дожидаясь
  // pointerup — палец-коснулся→реакция падает с ~570мс. startRef обнуляется —
  // guard одноразового срабатывания за жест (pointerup этого жеста уже no-op).
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || start.pointerId !== e.pointerId) return;
      const target = resolveTarget(e.clientX - start.x, e.clientY - start.y);
      if (!target) return;
      startRef.current = null;
      switchTab(target);
    },
    [resolveTarget, switchTab]
  );

  // Страховка: порог пересечён ровно на отпускании (движение закончилось до 60px,
  // последний move не пришёл в порог) — прежнее поведение как fallback.
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || start.pointerId !== e.pointerId) return;
      const target = resolveTarget(e.clientX - start.x, e.clientY - start.y);
      if (!target) return;
      switchTab(target);
    },
    [resolveTarget, switchTab]
  );

  // Браузер забрал жест (напр. под вертикальный скролл) — сбрасываем.
  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
