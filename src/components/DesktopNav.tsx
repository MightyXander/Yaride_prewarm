import { Icon } from './Icons';
import { SCREEN_TO_TAB, isNavVisibleForScreen, type NavTabRoot } from './FloatingNav';
import { DESKTOP_MAX_PX } from '../lib/layout';
import type { Screen } from '../types/navigation';

// Десктоп-топбар (issue #365): те же навигационные цели, что во FloatingNav
// (таб main, таб profile, колокол уведомлений), но в верхней раскладке —
// нормальный document-flow элемент, не портал/fixed pill. На десктопе
// заменяет FloatingNav (тот скрывается целиком), на мобиле не рендерится.

/** Высота десктоп-топбара — резервируется как flex-item в App.tsx. */
export const DESKTOP_NAV_HEIGHT = '4.5rem';

const ITEMS: { root: NavTabRoot; label: string; icon: string }[] = [
  { root: 'main', label: 'Поездки', icon: 'i-car' },
  { root: 'profile', label: 'Профиль', icon: 'i-user' },
];

interface DesktopNavProps {
  currentScreen: Screen;
  onNavigate: (root: NavTabRoot) => void;
  onNotificationsClick: () => void;
}

export function DesktopNav({ currentScreen, onNavigate, onNotificationsClick }: DesktopNavProps) {
  // Те же правила видимости, что у FloatingNav: flow-экраны без хрома, экраны без таба.
  if (!isNavVisibleForScreen(currentScreen)) return null;
  const activeTab = SCREEN_TO_TAB[currentScreen];
  if (!activeTab) return null;

  const bellActive = activeTab === 'notifications';

  return (
    <header
      style={{
        flexShrink: 0,
        width: '100%',
        borderBottom: '1px solid var(--border)',
        background: 'color-mix(in srgb, var(--card) 72%, transparent)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div
        style={{
          maxWidth: `${DESKTOP_MAX_PX}px`,
          margin: '0 auto',
          height: DESKTOP_NAV_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          padding: '0 24px',
        }}
      >
        <div
          aria-hidden
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: '17px',
            color: 'var(--foreground)',
          }}
        >
          <Icon id="i-car" style={{ width: '22px', height: '22px', color: 'var(--brand-dark)', strokeWidth: 2 }} />
          Yaride
        </div>

        <nav aria-label="Основная навигация" style={{ display: 'flex', gap: '4px' }}>
          {ITEMS.map(({ root, label, icon }) => {
            const active = root === activeTab;
            return (
              <button
                key={root}
                type="button"
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className="focus-ring pressable"
                onClick={() => onNavigate(root)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 18px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '15px',
                  fontWeight: 600,
                  background: active ? 'var(--gradient-brand)' : 'transparent',
                  color: active ? 'var(--brand-foreground)' : 'var(--foreground)',
                  transition: 'background 160ms ease, color 160ms ease',
                }}
              >
                <Icon
                  id={icon}
                  style={{ width: '17px', height: '17px', strokeWidth: 2, flexShrink: 0 }}
                />
                {label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          aria-label="Уведомления"
          aria-current={bellActive ? 'page' : undefined}
          title="Уведомления"
          className="focus-ring pressable"
          onClick={onNotificationsClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '38px',
            height: '38px',
            flexShrink: 0,
            borderRadius: '999px',
            border: 'none',
            cursor: 'pointer',
            background: bellActive ? 'var(--gradient-brand)' : 'var(--secondary)',
          }}
        >
          <Icon
            id="i-bell"
            style={{
              width: '18px',
              height: '18px',
              strokeWidth: 2,
              color: bellActive ? 'var(--brand-foreground)' : 'var(--foreground)',
            }}
          />
        </button>
      </div>
    </header>
  );
}

export default DesktopNav;
