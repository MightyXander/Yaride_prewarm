import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Icon } from './Icons';
import { hapticImpact, hapticSelection } from '../lib/haptics';
import type { Screen } from '../types/navigation';

// Какой таб нижней навигации владеет экраном (2 таба: Поездки / Профиль).
type NavTabRoot = 'main' | 'profile';

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
const HIDDEN_ON: Screen[] = [
  'intro',
  'booking-profile',
  'driver-publish',
  'booking-confirmed',
  'driver-bookings',
  'become-driver',
  'license-review',
  'in-trip',
  'safety',
  'passenger-request',
  'request-published',
  'alert-push',
  'my-trips',
  'rate-trip',
  'evening-publish',
  'add-car',
];

// Маппинг экрана → корневой таб. Поток поездок → Поездки; профиль → Профиль.
// 'notifications' — особый «таб»: навбар виден, активна подсветка колокола (не Поездки/Профиль).
const SCREEN_TO_TAB: Record<Screen, NavTabRoot | 'notifications' | null> = {
  intro: null,
  main: 'main',
  'main-more': 'main',
  'trip-details': 'main',
  'empty-state': 'main',
  'booking-profile': 'main',
  'driver-publish': 'main',
  'booking-confirmed': 'main',
  profile: 'profile',
  'driver-bookings': 'main',
  'become-driver': 'profile',
  'license-review': 'profile',
  'in-trip': 'main',
  safety: 'profile',
  'passenger-request': 'main',
  'request-published': 'main',
  'alert-push': 'main',
  'my-trips': 'profile',
  'rate-trip': 'profile',
  'evening-main': 'main',
  'evening-publish': 'main',
  'habit-home': 'main',
  'user-profile': null,
  notifications: 'notifications',
  'add-car': 'profile',
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

interface FloatingNavProps {
  currentScreen: Screen;
  onNavigate: (root: NavTabRoot) => void;
  onNotificationsClick: () => void;
}

function FloatingNavBar({
  activeTab,
  onNavigate,
  onNotificationsClick,
}: {
  activeTab: NavTabRoot | 'notifications';
  onNavigate: (root: NavTabRoot) => void;
  onNotificationsClick: () => void;
}) {
  // На экране уведомлений активна подсветка колокола → pill уезжает в первую ячейку (current = -1).
  const bellActive = activeTab === 'notifications';
  const current = ITEMS.findIndex(({ root }) => root === activeTab);
  const prefersReduced = useReducedMotion();

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
          aria-label="Основная навигация"
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
          }}
        >
          {/* Скользящий индикатор brand-gradient — только для двух табов (Поездки/Профиль) */}
          <div
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
              transform: `translateX(calc(${current + 1} * (100% + 0.25rem)))`,
              transition: prefersReduced ? 'none' : 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
          {/* Колокол уведомлений — слева, действие (не таб) */}
          <button
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
            <Icon
              id="i-bell"
              style={{
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
          </button>
          {/* Два таба навигации: Поездки, Профиль */}
          {ITEMS.map(({ root, label, icon }, index) => {
            const active = index === current;
            return (
              <button
                key={root}
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
                    {active ? (
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

export function FloatingNav({ currentScreen, onNavigate, onNotificationsClick }: FloatingNavProps) {
  if (HIDDEN_ON.includes(currentScreen)) return null;
  const activeTab = SCREEN_TO_TAB[currentScreen];
  if (!activeTab) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <FloatingNavBar activeTab={activeTab} onNavigate={onNavigate} onNotificationsClick={onNotificationsClick} />,
    document.body
  );
}

export default FloatingNav;
