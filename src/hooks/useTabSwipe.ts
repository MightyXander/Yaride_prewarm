import { useRef, useCallback } from 'react';
import type React from 'react';
import type { Screen } from '../types/navigation';
import type { TabRoot } from './useNavigation';

// Карусельный свайп между разделами: live-scrub (issue #422, паритет с Android
// Yaride_mobile#78) — палец тянет оба экрана (текущий + сосед) вживую, прогресс
// репортится в App (onScrubMove), отпускание — commit/откат (onScrubEnd).
// Прежний одноразовый порог 60px → switchTab (issue #415/#420) заменён
// прогресс-моделью: скраб начинается сразу после подтверждения горизонтальной
// доминанты, progress = |dx| / ширина обёртки.

// Коэффициент горизонтальной доминанты (|dx| > 1.5·|dy|) — не менять (границы #422).
const HORIZONTAL_DOMINANCE = 1.5;
// Минимальный |dx| активации скраба — анти-дребезг тапа (сам по себе раздел
// не переключает: решение commit/откат принимается прогрессом/скоростью).
const SCRUB_ACTIVATION_PX = 10;
// Порог commit по прогрессу (доля ширины) и по скорости в сторону цели (px/мс).
export const SCRUB_COMMIT_PROGRESS = 0.3;
export const SCRUB_COMMIT_VELOCITY = 0.5;
// Окно усреднения скорости флика (px/мс): скорость считается по точкам за
// последние VELOCITY_WINDOW_MS, а не по последней паре событий — браузер
// коалесцирует move-ы, и мгновенная пара занижает скорость флика.
const VELOCITY_WINDOW_MS = 100;

// Экраны, на которых жест активен: корни разделов + их «братья» внутри раздела.
// Flow-экраны (детали поездки, публикация и т.д.) и auth — не участвуют.
// Экспортируется: App включает caret-scrub навбара на тех же экранах (issue #422).
export const SWIPE_SCREENS: Screen[] = ['notifications', 'main', 'main-more', 'evening-main', 'profile'];

// Раздел карусели для экрана (индекс в TAB_ORDER: notifications(0) — main(1) — profile(2)).
// Экспортируется — App использует ту же принадлежность для tabScrub (issue #422).
export const SCREEN_TAB: Partial<Record<Screen, TabRoot>> = {
  notifications: 'notifications',
  main: 'main',
  'main-more': 'main',
  'evening-main': 'main',
  profile: 'profile',
};
export const TAB_ORDER: TabRoot[] = ['notifications', 'main', 'profile'];

interface UseTabSwipeArgs {
  currentScreen: Screen;
  /** Живой прогресс скраба: сосед `to`, progress 0..1 — позиция напрямую от пальца. */
  onScrubMove: (to: TabRoot, progress: number) => void;
  /** Палец отпущен/жест отменён: commit — довести вперёд, иначе откат. */
  onScrubEnd: (info: { commit: boolean }) => void;
}

/**
 * Pointer-обработчики для обёртки screenTransition в App.tsx.
 * Только touch; свайп влево — следующий раздел справа (main → profile),
 * вправо — предыдущий; на краях (notifications ←, profile →) — прогресс
 * зажат в 0 (края не зациклены). Свайп, начатый на карточке уведомления
 * ([data-swipe-card]), не стартует — карточка обрабатывает свой drag-жест
 * удаления (#337). Вертикальный скролл не перехватываем: preventDefault
 * не зовём вовсе, ранний выигрыш у скролла — по горизонтальной доминанте
 * (issue #420); если браузер забирает жест под скролл — pointercancel → откат.
 */
export function useTabSwipe({ currentScreen, onScrubMove, onScrubEnd }: UseTabSwipeArgs) {
  // Стартовая точка активного touch-жеста; null — жест не начат/сброшен.
  const startRef = useRef<{ x: number; y: number; pointerId: number; width: number } | null>(null);
  // Активный скраб этого жеста; null — доминанта ещё не подтверждена.
  const scrubRef = useRef<{ to: TabRoot; progress: number } | null>(null);
  // Скользящее окно точек за последние VELOCITY_WINDOW_MS — скорость флика
  // считается по окну (как VelocityTracker в Android), а не по последней паре
  // событий: браузер коалесцирует move-ы, и мгновенная пара занижает скорость.
  const samplesRef = useRef<{ x: number; t: number }[]>([]);

  // Сосед по направлению пальца: dx < 0 (свайп влево) — раздел справа; null — край.
  const resolveNeighbor = useCallback(
    (dx: number): TabRoot | null => {
      const currentTab = SCREEN_TAB[currentScreen];
      if (!currentTab) return null;
      const targetIndex = TAB_ORDER.indexOf(currentTab) + (dx < 0 ? 1 : -1);
      return TAB_ORDER[targetIndex] ?? null;
    },
    [currentScreen]
  );

  const resetGesture = useCallback(() => {
    startRef.current = null;
    scrubRef.current = null;
    samplesRef.current = [];
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!SWIPE_SCREENS.includes(currentScreen)) return;
      // Жест начат на карточке уведомления — раздел не скрабим,
      // карточка обрабатывает собственный drag (свайп-удаление).
      if ((e.target as Element).closest('[data-swipe-card]')) return;
      resetGesture();
      const width = (e.currentTarget as HTMLElement).clientWidth || window.innerWidth;
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, width };
      samplesRef.current = [{ x: e.clientX, t: e.timeStamp }];
    },
    [currentScreen, resetGesture]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || start.pointerId !== e.pointerId) return;

      // Окно скорости: копим точки, отбрасываем старше VELOCITY_WINDOW_MS.
      const samples = samplesRef.current;
      samples.push({ x: e.clientX, t: e.timeStamp });
      while (samples.length > 1 && e.timeStamp - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // Скраб ещё не активирован: ждём подтверждения горизонтальной доминанты.
      if (!scrubRef.current) {
        if (Math.abs(dx) < SCRUB_ACTIVATION_PX || Math.abs(dx) <= HORIZONTAL_DOMINANCE * Math.abs(dy)) return;
      }

      const neighbor = resolveNeighbor(dx);
      if (!neighbor) {
        // Край карусели: активный скраб зажимаем в 0 (палец ушёл за старт
        // в сторону, где соседа нет); неактивный — не стартуем.
        const scrub = scrubRef.current;
        if (scrub) {
          scrub.progress = 0;
          onScrubMove(scrub.to, 0);
        }
        return;
      }

      const progress = Math.min(Math.abs(dx) / start.width, 1);
      scrubRef.current = { to: neighbor, progress };
      onScrubMove(neighbor, progress);
    },
    [onScrubMove, resolveNeighbor]
  );

  // commit если progress ≥ 0.3 ИЛИ горизонтальная скорость в сторону цели > 0.5 px/мс —
  // решение принимается в onPointerUp по scrubRef + velocityRef.

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || start.pointerId !== e.pointerId) return;

      let scrub = scrubRef.current;
      // Страховка: доминанта подтвердилась ровно на отпускании (последний move
      // не успел прийти) — активируем скраб постфактум, решение примут пороги.
      if (!scrub) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) >= SCRUB_ACTIVATION_PX && Math.abs(dx) > HORIZONTAL_DOMINANCE * Math.abs(dy)) {
          const neighbor = resolveNeighbor(dx);
          if (neighbor) {
            scrub = { to: neighbor, progress: Math.min(Math.abs(dx) / start.width, 1) };
            onScrubMove(neighbor, scrub.progress);
          }
        }
      }
      if (!scrub) {
        resetGesture();
        return;
      }

      // Скорость флика по скользящему окну: включаем точку отпускания и
      // отбрасываем всё старше VELOCITY_WINDOW_MS — пауза перед отпусканием
      // естественно обнуляет скорость (окно схлопывается до up-точки).
      const samples = samplesRef.current;
      samples.push({ x: e.clientX, t: e.timeStamp });
      while (samples.length > 1 && e.timeStamp - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
      const first = samples[0];
      const last = samples[samples.length - 1];
      const spanMs = last.t - first.t;
      // px/мс, знак = направление: v < 0 — палец влево.
      const velocity = spanMs > 0 ? (last.x - first.x) / spanMs : 0;

      const currentTab = SCREEN_TAB[currentScreen];
      const toRight = currentTab ? TAB_ORDER.indexOf(scrub.to) > TAB_ORDER.indexOf(currentTab) : true;
      // Сосед справа — движение к цели это v < 0 (палец влево).
      const towardVelocity = toRight ? -velocity : velocity;
      const commit = scrub.progress >= SCRUB_COMMIT_PROGRESS || towardVelocity > SCRUB_COMMIT_VELOCITY;
      resetGesture();
      onScrubEnd({ commit });
    },
    [currentScreen, onScrubEnd, onScrubMove, resolveNeighbor, resetGesture]
  );

  // Браузер забрал жест (напр. под вертикальный скролл) — активный скраб откатываем.
  const onPointerCancel = useCallback(() => {
    const wasScrubbing = scrubRef.current !== null;
    resetGesture();
    if (wasScrubbing) onScrubEnd({ commit: false });
  }, [onScrubEnd, resetGesture]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
