import { Icon } from './Icons';
import Button from './ui/Button';
import Avatar from './ui/Avatar';
import { SCREEN_TO_TAB, isNavVisibleForScreen, type NavTabRoot } from './FloatingNav';
import { useProfile } from '../contexts/ProfileContext';
import { useScreenData } from '../hooks/useScreenData';
import { fetchNotifications } from '../lib/screenFetchers';
import { SIDEBAR_PX } from '../lib/layout';
import type { NotificationItem } from '../types/api';
import type { Screen } from '../types/navigation';

// Постоянный левый сайдбар на десктопе (issue #379, шаг 1 эпика #364) — заменяет
// верхний топбар DesktopNav (#365). Те же навигационные цели, что во FloatingNav
// (таб main, таб profile, колокол уведомлений) + CTA публикации и блок пользователя.
// Мобиль/Telegram (<900px) сайдбар не рендерят — App.tsx монтирует его только
// внутри десктоп-ветки раскладки, здесь дополнительно дублируем видимость по
// isNavVisibleForScreen (та же проверка, что была у DesktopNav) на случай прямого
// использования компонента.

/** Ширина сайдбара — реэкспорт для читателей layout.ts. */
export const DESKTOP_SIDEBAR_WIDTH = `${SIDEBAR_PX}px`;

const NAV_ITEMS: { tab: NavTabRoot | 'notifications'; label: string; icon: string }[] = [
  { tab: 'main', label: 'Поездки', icon: 'i-car' },
  { tab: 'profile', label: 'Профиль', icon: 'i-user' },
  { tab: 'notifications', label: 'Уведомления', icon: 'i-bell' },
];

// Инициалы из имени — идентично ProfileScreen.tsx (issue #379: переиспользуем тот же идиом).
function getInitials(name: string | undefined | null): string {
  if (!name) return 'Н';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || 'Н';
}

interface DesktopSidebarProps {
  currentScreen: Screen;
  onNavigate: (root: NavTabRoot) => void;
  onNotificationsClick: () => void;
  /** CTA «Опубликовать поездку» → экран публикации (issue #379, решённая развилка). */
  onPublish: () => void;
}

export function DesktopSidebar({ currentScreen, onNavigate, onNotificationsClick, onPublish }: DesktopSidebarProps) {
  // Те же правила видимости, что были у DesktopNav/FloatingNav: flow-экраны без хрома.
  const { profile } = useProfile();
  // Тот же ключ кэша 'notifications', что уже прогревается idle-варминго в App.tsx —
  // отдельного сетевого запроса это не добавляет, только читает уже тёплый кэш
  // (issue #352 screenDataCache), тихо освежаясь через useRefetchOnFocus.
  const { data: notifications } = useScreenData<NotificationItem[]>('notifications', fetchNotifications);
  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  if (!isNavVisibleForScreen(currentScreen)) return null;
  const activeTab = SCREEN_TO_TAB[currentScreen];
  if (!activeTab) return null;

  const initials = getInitials(profile?.name);
  const displayName = profile?.name ?? 'Загрузка…';

  return (
    <aside
      style={{
        width: `${SIDEBAR_PX}px`,
        flexShrink: 0,
        height: '100%',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Лого — «ЯРайд» кириллицей (issue #379, решённая развилка: НЕ «ЯRide»). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
          padding: '0 8px',
        }}
      >
        <div
          aria-hidden
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '14px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: '18px',
            color: 'var(--brand-foreground)',
            flexShrink: 0,
          }}
        >
          Я
        </div>
        <div style={{ fontSize: '19px', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--foreground)' }}>
          ЯРайд
        </div>
      </div>

      <nav aria-label="Основная навигация" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
        {NAV_ITEMS.map(({ tab, label, icon }) => {
          const active = tab === activeTab;
          const badge = tab === 'notifications' && unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : null;
          return (
            <button
              key={tab}
              type="button"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="focus-ring pressable"
              onClick={() => (tab === 'notifications' ? onNotificationsClick() : onNavigate(tab))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '11px 12px',
                borderRadius: '14px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: '15px',
                fontWeight: active ? 700 : 600,
                textAlign: 'left',
                background: active ? 'var(--gradient-brand)' : 'transparent',
                color: active ? 'var(--brand-foreground)' : 'var(--foreground)',
                boxShadow: active ? 'var(--shadow-hero)' : 'none',
                transition: 'background 160ms ease, color 160ms ease',
              }}
            >
              <Icon
                id={icon}
                style={{
                  width: '17px',
                  height: '17px',
                  strokeWidth: 2,
                  flexShrink: 0,
                  color: active ? 'var(--brand-foreground)' : 'var(--muted-foreground)',
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              {badge !== null && (
                <span
                  style={{
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 5px',
                    borderRadius: '999px',
                    background: 'var(--danger)',
                    color: 'var(--danger-foreground)',
                    fontSize: '11px',
                    fontWeight: 800,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ marginBottom: '20px' }}>
        <Button variant="primary" icon="i-plus" onClick={onPublish} style={{ width: '100%' }}>
          Опубликовать поездку
        </Button>
      </div>

      <button
        type="button"
        className="focus-ring pressable"
        onClick={() => onNavigate('profile')}
        aria-label="Открыть профиль"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px',
          paddingTop: '16px',
          border: 'none',
          borderTop: '1px solid var(--border)',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <Avatar label={initials} size={40} hideRating />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--foreground)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName}
          </div>
          {profile && profile.rating_count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
              <Icon id="i-star" fill style={{ width: '11px', height: '11px', fill: 'var(--star)' }} />
              {profile.rating_avg.toFixed(1)}
            </div>
          )}
        </div>
      </button>
    </aside>
  );
}

export default DesktopSidebar;
