import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
];

// Маппинг экрана → корневой таб. Поток поездок → Поездки; профиль → Профиль.
const SCREEN_TO_TAB: Record<Screen, NavTabRoot | null> = {
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
};

/** Высота pill без внешних отступов. */
export const FLOATING_NAV_HEIGHT = '3.75rem';

/** Нижний внутренний отступ обёртки nav. */
export const FLOATING_NAV_BOTTOM = 'max(14px, env(safe-area-inset-bottom, 0px))';

/** Сколько padding-bottom добавить контенту, чтобы pill его не перекрывал. */
export const FLOATING_NAV_CONTENT_PADDING = `calc(${FLOATING_NAV_BOTTOM} + ${FLOATING_NAV_HEIGHT} + 22px)`;

interface FloatingNavProps {
  currentScreen: Screen;
  onNavigate: (root: NavTabRoot) => void;
}

function FloatingNavBar({ activeTab, onNavigate }: { activeTab: NavTabRoot; onNavigate: (root: NavTabRoot) => void }) {
  const current = ITEMS.findIndex(({ root }) => root === activeTab);

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
      <div style={{ width: '20rem', maxWidth: 'calc(100% - 2rem)' }}>
        <nav
          aria-label="Основная навигация"
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            height: FLOATING_NAV_HEIGHT,
            width: '100%',
            overflow: 'visible',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            // Frosted glass: полупрозрачная подложка (75%) + усиленный blur.
            // Контент виден сквозь nav; контраст неактивного таба поднят до 78%.
            background: 'color-mix(in srgb, var(--card) 75%, transparent)',
            padding: '6px',
            boxShadow: '0 14px 40px -16px rgba(0, 0, 0, .45), 0 2px 8px -4px rgba(0, 0, 0, .25)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Скользящий индикатор brand-gradient */}
          <div
            aria-hidden
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: '6px',
              bottom: '6px',
              left: '6px',
              width: 'calc((100% - 0.75rem - 0.25rem) / 2)',
              borderRadius: '999px',
              background: 'var(--gradient-brand)',
              boxShadow: '0 4px 14px -4px rgba(255, 210, 40, 0.55)',
              transform: `translateX(calc(${current} * (100% + 0.25rem)))`,
              transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
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
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
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

export function FloatingNav({ currentScreen, onNavigate }: FloatingNavProps) {
  if (HIDDEN_ON.includes(currentScreen)) return null;
  const activeTab = SCREEN_TO_TAB[currentScreen];
  if (!activeTab) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(<FloatingNavBar activeTab={activeTab} onNavigate={onNavigate} />, document.body);
}

export default FloatingNav;
