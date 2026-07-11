import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Icon } from './Icons';
import { hapticImpact, hapticSelection } from '../lib/haptics';
import type { Screen } from '../types/navigation';

// Какой таб нижней навигации владеет экраном (2 таба: Поездки / Профиль).
// Экспортируется — переиспользуется DesktopSidebar (issue #379, было DesktopNav #365), у него те же навигационные цели.
export type NavTabRoot = 'main' | 'profile';

interface NavItem {
  root: NavTabRoot;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { root: 'main', label: 'Поездки', icon: 'i-car' },
  { root: 'profile', label: 'Профиль', icon: 'i-user' },
];

// Экраны, на которых nav скрыт (flow-экраны, где pill мешает).
// Экспортируется — DesktopSidebar (issue #379, было DesktopNav #365) скрывается на тех же flow-экранах.
export const HIDDEN_ON: Screen[] = [
  'auth-gate',
  'login',
  'register',
  'intro',
  'booking-profile',
  'driver-publish',
  'booking-confirmed',
  'become-driver',
  'license-review',
  'request-published',
  'alert-push',
  'rate-trip',
  'evening-publish',
  'add-car',
];

// Маппинг экрана → корневой таб. Поток поездок → Поездки; профиль → Профиль.
// 'notifications' — особый «таб»: навбар виден, активна подсветка колокола (не Поездки/Профиль).
// Экспортируется — переиспользуется DesktopSidebar (issue #379, было DesktopNav #365).
export const SCREEN_TO_TAB: Record<Screen, NavTabRoot | 'notifications' | null> = {
  'auth-gate': null,
  login: null,
  register: null,
  intro: null,
  main: 'main',
  'main-more': 'main',
  'trip-details': 'main',
  'empty-state': 'main',
  'booking-profile': 'main',
  'driver-publish': 'main',
  'booking-confirmed': 'main',
  profile: 'profile',
  'become-driver': 'profile',
  'license-review': 'profile',
  'my-cars': 'profile',
  safety: 'profile',
  'passenger-request': 'main',
  'request-published': 'main',
  'alert-push': 'main',
  'my-trips': 'profile',
  'rate-trip': 'profile',
  'evening-main': 'main',
  'evening-publish': 'main',
  'habit-home': 'main',
  'user-profile': 'main',
  notifications: 'notifications',
  'add-car': 'profile',
  'my-alerts': 'profile',
};

/** Высота pill без внешних отступов. */
export const FLOATING_NAV_HEIGHT = '3.75rem';

/** Нижний внутренний отступ обёртки nav. */
export const FLOATING_NAV_BOTTOM = 'max(14px, env(safe-area-inset-bottom, 0px))';

/** Сколько padding-bottom добавить контенту, чтобы pill его не перекрывал.
 * Уменьшено для iOS-стиля: контент скроллится ПОД полупрозрачный навбар. */
export const FLOATING_NAV_CONTENT_PADDING = `calc(env(safe-area-inset-bottom, 0px) + 12px)`;

/** Нижний клиренс для собственных скролл-контейнеров (flex:1; overflow:auto).
 * В отличие от FLOATING_NAV_CONTENT_PADDING (визуальное «подъезжание» под матовый
 * навбар), здесь нужен полноценный отступ под высоту pill — чтобы ПОСЛЕДНИЙ
 * интерактивный элемент (напр. кнопка «Забронировать» в раскрытой карточке)
 * доскролливался ВЫШЕ навбара, а не оставался под ним. */
export const FLOATING_NAV_SCROLL_CLEARANCE = `calc(${FLOATING_NAV_HEIGHT} + 40px)`;

// Порог горизонтали (px) для старта drag каретки без hold — сразу «свайпаешь» по навбару.
const DRAG_ACTIVATION_PX = 6;

interface FloatingNavProps {
  currentScreen: Screen;
  onNavigate: (root: NavTabRoot) => void;
  onNotificationsClick: () => void;
  /** Живой скраб карусели (issue #422): дробная позиция каретки в слотах
   * (0 — колокол, 1 — Поездки, 2 — Профиль); null — settled-поведение (#421). */
  scrubOffset?: number | null;
  /** Drag каретки скрабит экраны: репорт дробной позиции в слотах на каждый move. */
  onCaretScrub?: (slotFraction: number) => void;
  /** Каретка отпущена (cancelled — жест отменён/сорван): App решает commit/откат. */
  onCaretScrubEnd?: (cancelled: boolean) => void;
}

function FloatingNavBar({
  activeTab,
  onNavigate,
  onNotificationsClick,
  scrubOffset = null,
  onCaretScrub,
  onCaretScrubEnd,
}: {
  activeTab: NavTabRoot | 'notifications';
  onNavigate: (root: NavTabRoot) => void;
  onNotificationsClick: () => void;
  scrubOffset?: number | null;
  onCaretScrub?: (slotFraction: number) => void;
  onCaretScrubEnd?: (cancelled: boolean) => void;
}) {
  // На экране уведомлений активна подсветка колокола → pill уезжает в первую ячейку (current = -1).
  const bellActive = activeTab === 'notifications';
  const current = ITEMS.findIndex(({ root }) => root === activeTab);
  const prefersReduced = useReducedMotion();

  // --- Drag каретки (touch & hold): pointerdown в области навбара + удержание ≥250мс без
  // отпускания активирует drag-режим — каретка прыгает под палец и следует за ним по X;
  // отпускание раньше активирует обычный клик (поведение не меняется). Слотов три: 0 = колокол,
  // 1 = Поездки, 2 = Профиль (индекс совпадает с `current + 1`, который использует transform-формула ниже).
  const navElRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  // Ближайший слот в drag — state-зеркало lastSlotRef: подпись «следует за пальцем»
  // (labelSlot ниже) требует ререндера при смене слота (issue #422).
  const [dragSlot, setDragSlot] = useState<number | null>(null);

  const pointerIdRef = useRef<number | null>(null);
  const startPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragBaseFracRef = useRef(0);
  const dragStartFracRef = useRef(0);
  const dragActiveRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastSlotRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const getSlotElements = useCallback(
    (): (HTMLButtonElement | null)[] => [bellRef.current, tabRefs.current[0] ?? null, tabRefs.current[1] ?? null],
    []
  );

  const nearestSlot = useCallback(
    (clientX: number): number => {
      const slots = getSlotElements();
      let best = 0;
      let bestDist = Infinity;
      slots.forEach((el, idx) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const dist = Math.abs(clientX - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = idx;
        }
      });
      return best;
    },
    [getSlotElements]
  );


  // Непрерывная позиция пальца в слотах (0..2): линейная интерполяция между
  // центрами слот-кнопок; за крайними центрами — зажим (края не зациклены).
  // Питает onCaretScrub (скраб экранов) и labelSlot (подпись под кареткой).
  const slotFractionForClientX = useCallback(
    (clientX: number): number => {
      const centers: number[] = [];
      for (const el of getSlotElements()) {
        if (!el) return lastSlotRef.current ?? 0;
        const rect = el.getBoundingClientRect();
        centers.push(rect.left + rect.width / 2);
      }
      if (clientX <= centers[0]) return 0;
      if (clientX >= centers[centers.length - 1]) return centers.length - 1;
      for (let i = 0; i < centers.length - 1; i++) {
        if (clientX <= centers[i + 1]) {
          return i + (clientX - centers[i]) / (centers[i + 1] - centers[i]);
        }
      }
      return centers.length - 1;
    },
    [getSlotElements]
  );

  const navigateToSlot = useCallback(
    (slot: number) => {
      if (slot === 0) {
        onNotificationsClick();
      } else {
        onNavigate(ITEMS[slot - 1].root);
      }
    },
    [onNavigate, onNotificationsClick]
  );


  // Полный сброс drag-состояния (issue #420, дефект B): осиротевший drag —
  // pointerup/pointercancel не был доставлен — иначе оставляет каретку навечно
  // в drag-позиции без transition, и переходы её больше не двигают.
  const resetDragState = useCallback(() => {
    // Активный drag срывается без pointerup (blur/скрытие вкладки) — откат скраба.
    if (dragActiveRef.current) onCaretScrubEnd?.(true);
    dragActiveRef.current = false;
    lastSlotRef.current = null;
    startPointerRef.current = null;
    setIsDragging(false);
    setDragFraction(null);
    setDragSlot(null);
  }, [onCaretScrubEnd]);

  // Страховка: браузер увёл фокус/вкладку посреди drag — pointerup уже не придёт.
  useEffect(() => {
    const onBlur = () => resetDragState();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') resetDragState();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [resetDragState]);

  const handleNavPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Осиротевший drag от предыдущего пойнтера (up/cancel не доставлен) —
      // полный сброс ДО начала новой сессии, иначе isDragging/dragFraction залипают.
      if (dragActiveRef.current || isDragging) {
        resetDragState();
      }
      pointerIdRef.current = e.pointerId;
      startPointerRef.current = { x: e.clientX, y: e.clientY };
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      dragActiveRef.current = false;
      // Без hold-таймера: drag активируется сразу по горизонтальному движению
      // (порог DRAG_ACTIVATION_PX) в onPointerMove; тап без движения — обычный клик.
    },
    [isDragging, resetDragState]
  );

  const handleNavPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      // Активация drag: сразу по горизонтальному движению сверх порога (без hold).
      if (!dragActiveRef.current) {
        const start = startPointerRef.current;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) < DRAG_ACTIVATION_PX || Math.abs(dx) <= Math.abs(dy)) return;
        dragActiveRef.current = true;
        try {
          navElRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* capture недоступен — drag продолжит работать через bubbling */
        }
        // Дельта-модель (без скачка под палец): каретка стартует со своего слота и
        // едет на дельту дробной позиции пальца от точки нажатия (issue #422).
        dragBaseFracRef.current = bellActive ? 0 : current + 1;
        dragStartFracRef.current = slotFractionForClientX(start.x);
        setIsDragging(true);
      }
      const frac = Math.min(
        2,
        Math.max(0, dragBaseFracRef.current + (slotFractionForClientX(e.clientX) - dragStartFracRef.current))
      );
      const slot = Math.round(frac);
      if (slot !== lastSlotRef.current) {
        lastSlotRef.current = slot;
        setDragSlot(slot);
        hapticSelection();
      }
      setDragFraction(frac);
      onCaretScrub?.(frac);
    },
    [bellActive, current, onCaretScrub, slotFractionForClientX]
  );

  const endPointerSession = useCallback(
    (e: React.PointerEvent<HTMLElement>, commit: boolean) => {
      if (pointerIdRef.current !== e.pointerId) return;
      const wasDragging = dragActiveRef.current;
      if (wasDragging) {
        const navEl = navElRef.current;
        try {
          navEl?.releasePointerCapture(e.pointerId);
        } catch {
          /* уже отпущен — не критично */
        }
        setIsDragging(false);
        setDragFraction(null);
        setDragSlot(null);
        if (onCaretScrubEnd) {
          // Live-scrub (issue #422): решение commit/откат принимает App по
          // последней дробной позиции; сам слот здесь не навигируем.
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
          if (commit) hapticImpact('light');
          onCaretScrubEnd(!commit);
        } else if (commit) {
          const slot = lastSlotRef.current ?? nearestSlot(e.clientX);
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
          hapticImpact('light');
          navigateToSlot(slot);
        }
      }
      dragActiveRef.current = false;
      pointerIdRef.current = null;
      startPointerRef.current = null;
      lastPointerRef.current = null;
      lastSlotRef.current = null;
    },
    [navigateToSlot, nearestSlot, onCaretScrubEnd]
  );

  const handleNavPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => endPointerSession(e, true),
    [endPointerSession]
  );

  const handleNavPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => endPointerSession(e, false),
    [endPointerSession]
  );

  const handleNavClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  // Слот с раскрытой подписью (issue #422): в drag/скрабе «фокус следует за
  // пальцем» — подпись только у слота под кареткой; settled — у активного, как раньше.
  const settledSlot = bellActive ? 0 : current + 1;
  const labelSlot =
    isDragging && dragSlot !== null
      ? dragSlot
      : scrubOffset != null
        ? Math.round(Math.min(2, Math.max(0, scrubOffset)))
        : settledSlot;

  return (
    <div
      style={{
        pointerEvents: 'none',
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
        paddingTop: '12px',
        paddingBottom: FLOATING_NAV_BOTTOM,
      }}
    >
      {/* Мягкий fade-скрим у нижней кромки для плавного перехода контента под навбар */}
      <div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '24px',
          background: 'linear-gradient(to top, var(--background), transparent)',
          zIndex: 39,
        }}
      />
      <div style={{ width: '20rem', maxWidth: 'calc(100% - 2rem)' }}>
        <nav
          ref={navElRef}
          aria-label="Основная навигация"
          onPointerDown={handleNavPointerDown}
          onPointerMove={handleNavPointerMove}
          onPointerUp={handleNavPointerUp}
          onPointerCancel={handleNavPointerCancel}
          onClickCapture={handleNavClickCapture}
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '4px',
            height: FLOATING_NAV_HEIGHT,
            width: '100%',
            overflow: 'visible',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            // Frosted glass: полупрозрачная подложка (58%) + усиленный blur.
            // Контент виден сквозь nav; контраст неактивного таба поднят до 78%.
            background: 'color-mix(in srgb, var(--card) 58%, transparent)',
            padding: '6px',
            boxShadow: '0 14px 40px -16px rgba(0, 0, 0, .45), 0 2px 8px -4px rgba(0, 0, 0, .25)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            // Без этого долгое удержание на навбаре может запустить нативный page-scroll/zoom
            // до того, как активируется drag-режим каретки (навбар сам не скроллится).
            touchAction: 'none',
          }}
        >
          {/* Скользящий индикатор brand-gradient — только для двух табов (Поездки/Профиль).
              Единая система координат (issue #420, дефект A): left ВСЕГДА 6px, позиция —
              только transform-ом. В drag transform = translateX(dragX − 6px) без transition;
              при отпускании transition возвращается и transform анимируется px→calc-слот
              (никогда от 'none' — иначе телепорт каретки к левому краю). */}
          <div
            ref={caretRef}
            aria-hidden
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: '6px',
              bottom: '6px',
              left: '6px',
              width: 'calc((100% - 0.75rem - 8px) / 3)',
              borderRadius: '999px',
              background: 'var(--gradient-brand)',
              boxShadow: '0 4px 14px -4px rgba(255, 210, 40, 0.55)',
              transform:
                isDragging && dragFraction !== null
                  ? `translateX(calc(${dragFraction} * (100% + 0.25rem)))`
                  : scrubOffset != null
                    // Скраб карусели (issue #422): интерполированная позиция в слотах,
                    // синхронно с прогрессом экрана; без transition (позиция от пальца/tween).
                    ? `translateX(calc(${Math.min(2, Math.max(0, scrubOffset))} * (100% + 0.25rem)))`
                    : `translateX(calc(${current + 1} * (100% + 0.25rem)))`,
              transition:
                isDragging || scrubOffset != null || prefersReduced
                  ? 'none'
                  : 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
          {/* Колокол уведомлений — слева, действие (не таб) */}
          <button
            ref={bellRef}
            type="button"
            aria-label="Уведомления"
            aria-current={bellActive ? 'page' : undefined}
            title="Уведомления"
            className="focus-ring pressable"
            onClick={() => {
              hapticImpact('light');
              onNotificationsClick();
            }}
            style={{
              position: 'relative',
              zIndex: 10,
              display: 'flex',
              minWidth: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '999px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              touchAction: 'manipulation',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              padding: 0,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon
                id="i-bell"
                style={{
                  position: 'relative',
                  zIndex: 10,
                  width: '19px',
                  height: '19px',
                  flexShrink: 0,
                  strokeWidth: 2,
                  color: bellActive
                    ? 'var(--brand-foreground)'
                    : 'color-mix(in srgb, var(--foreground) 76%, transparent)',
                  transition: 'color 200ms ease',
                }}
              />
              <AnimatePresence initial={false} mode="wait">
                {labelSlot === 0 ? (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                    animate={{ opacity: 1, width: 'auto', marginLeft: 6 }}
                    exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                    style={{
                      overflow: 'hidden',
                      fontSize: '15px',
                      fontWeight: 600,
                      lineHeight: 1,
                      color: 'var(--brand-foreground)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Пуши
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </button>
          {/* Два таба навигации: Поездки, Профиль */}
          {ITEMS.map(({ root, label, icon }, index) => {
            const active = index === current;
            return (
              <button
                key={root}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                title={label}
                className="focus-ring"
                onPointerDown={() => (active ? hapticImpact('light') : hapticSelection())}
                onClick={() => {
                  hapticImpact('light');
                  onNavigate(root);
                }}
                style={{
                  position: 'relative',
                  zIndex: 10,
                  display: 'flex',
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '999px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  padding: 0,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon
                    id={icon}
                    style={{
                      position: 'relative',
                      zIndex: 10,
                      width: '18px',
                      height: '18px',
                      flexShrink: 0,
                      strokeWidth: 2,
                      color: active
                        ? 'var(--brand-foreground)'
                        : 'color-mix(in srgb, var(--foreground) 78%, transparent)',
                      transition: 'color 200ms ease',
                    }}
                  />
                  <AnimatePresence initial={false} mode="wait">
                    {labelSlot === index + 1 ? (
                      <motion.span
                        key="label"
                        initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                        animate={{ opacity: 1, width: 'auto', marginLeft: 6 }}
                        exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                        transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                        style={{
                          overflow: 'hidden',
                          fontSize: '15px',
                          fontWeight: 600,
                          lineHeight: 1,
                          color: 'var(--brand-foreground)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** Виден ли нав-хром (FloatingNav/DesktopSidebar) на этом экране — общая проверка
 * (issue #365), чтобы BackButton знал, резервировать ли место под топбар. */
export function isNavVisibleForScreen(screen: Screen): boolean {
  return !HIDDEN_ON.includes(screen) && !!SCREEN_TO_TAB[screen];
}

export function FloatingNav({ currentScreen, onNavigate, onNotificationsClick, scrubOffset, onCaretScrub, onCaretScrubEnd }: FloatingNavProps) {
  if (!isNavVisibleForScreen(currentScreen)) return null;
  const activeTab = SCREEN_TO_TAB[currentScreen];
  if (!activeTab) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <FloatingNavBar
      activeTab={activeTab}
      onNavigate={onNavigate}
      onNotificationsClick={onNotificationsClick}
      scrubOffset={scrubOffset}
      onCaretScrub={onCaretScrub}
      onCaretScrubEnd={onCaretScrubEnd}
    />,
    document.body
  );
}

export default FloatingNav;
