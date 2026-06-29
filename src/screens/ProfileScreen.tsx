import { useState, useEffect, type ReactNode } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { useProfile } from '../contexts/ProfileContext';
import { getMyCars } from '../lib/api';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';

interface ProfileScreenProps {
  onBecomeDriver: () => void;
  onLicenseReview: () => void;
  /** Открыть экран «Безопасность и SOS» (экран 19). */
  onSafety?: () => void;
  /** Открыть экран «Мои поездки» (экран 17). */
  onMyTrips?: () => void;
  /** Открыть экран «Мои машины» / добавление машины. */
  onMyCars?: () => void;
  /** Переключение темы (light/dark). */
  onToggleTheme?: () => void;
  /** Текущая тема. */
  theme?: 'light' | 'dark';
  /** Открыть публичный профиль пользователя. */
  onOpenProfile?: (userId: number) => void;
}

// Контурная иконка строки меню (20px).
const navIconStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// Шеврон-вправо в конце строки меню.
const ChevronRight = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ width: '18px', height: '18px', fill: 'none', stroke: 'var(--muted-foreground)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flexShrink: 0 }}
    aria-hidden="true"
  >
    <path d="M9.5 6l6 6-6 6" />
  </svg>
);

interface MenuRowProps {
  icon: ReactNode;
  label: ReactNode;
  onClick?: () => void;
  /** Правый слот (по умолчанию шеврон). */
  right?: ReactNode;
  /** Последняя строка — без нижней границы. */
  last?: boolean;
}

const MenuRow: React.FC<MenuRowProps> = ({ icon, label, onClick, right, last }) => (
  <button
    type="button"
    className="focus-ring pressable"
    onClick={() => {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      onClick?.();
    }}
    style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '15px 16px',
      background: 'transparent',
      border: 'none',
      borderBottom: last ? 'none' : '1px solid var(--border)',
      color: 'var(--foreground)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: '15px',
      cursor: 'pointer',
      textAlign: 'left',
    }}
  >
    <span style={{ width: '20px', height: '20px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</span>
    <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
    {right ?? <ChevronRight />}
  </button>
);

const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBecomeDriver, onLicenseReview, onSafety, onMyTrips, onMyCars, onToggleTheme, theme, onOpenProfile }) => {
  const { profile, loading } = useProfile();
  const [carsCount, setCarsCount] = useState(0);

  useEffect(() => {
    getMyCars()
      .then((r) => setCarsCount(r.cars.length))
      .catch(() => {
        // Не блокируем UI при ошибке — оставляем 0.
      });
  }, []);

  const initials = profile
    ? profile.name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || 'Н'
    : 'Н';
  const name = profile?.name ?? 'Загрузка…';
  const age = profile?.age ?? null;
  const rating = profile?.rating_avg ?? 0;
  const tripCount = (profile?.trips_driver_count ?? 0) + (profile?.trips_passenger_count ?? 0);
  const licenseStatus = profile?.license_status;
  const licenseVerified = licenseStatus === 'verified';
  const userId = profile?.id;

  // Логика кнопки «Стать водителем» / «Заполнить заново»
  const shouldShowDriverButton = licenseStatus !== 'verified' && licenseStatus !== 'pending';
  const isLicenseRejected = licenseStatus === 'rejected' || licenseStatus === 'declined';
  const driverButtonLabel = isLicenseRejected ? 'Заполнить заново' : 'Стать водителем';

  const openSelf = () => {
    if (userId && onOpenProfile) {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      onOpenProfile(userId);
    }
  };

  // Статус ВУ в правом слоте строки (только если есть осмысленный статус).
  const licenseRight = (licenseStatus === 'verified' || licenseStatus === 'pending') ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color: licenseVerified ? 'var(--success)' : 'var(--muted-foreground)' }}>
        {licenseVerified ? 'Подтверждено' : 'На проверке'}
      </span>
      <ChevronRight />
    </span>
  ) : undefined;

  // Переключатель темы (трек + бегунок).
  const themeToggle = (
    <span
      aria-hidden="true"
      style={{ width: '44px', height: '26px', borderRadius: '999px', background: theme === 'dark' ? 'var(--brand)' : 'var(--secondary)', position: 'relative', flexShrink: 0, transition: 'background .2s ease' }}
    >
      <span style={{ position: 'absolute', top: '3px', left: '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transform: theme === 'dark' ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .2s cubic-bezier(.22,1,.36,1)' }} />
    </span>
  );

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px',
        paddingBottom: FLOATING_NAV_SCROLL_CLEARANCE,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Header title="Профиль" />

      {/* Карточка профиля */}
      {loading ? (
        <Card style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: '18px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'var(--secondary)', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: '18px', width: '55%', borderRadius: '8px', background: 'var(--secondary)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: '13px', width: '40%', borderRadius: '6px', background: 'var(--secondary)', animation: 'pulse 1.5s ease-in-out infinite', marginTop: '8px' }} />
          </div>
        </Card>
      ) : (
        <Card
          role={userId && onOpenProfile ? 'button' : undefined}
          tabIndex={userId && onOpenProfile ? 0 : undefined}
          aria-label={userId && onOpenProfile ? 'Открыть мой публичный профиль' : undefined}
          onClick={userId && onOpenProfile ? openSelf : undefined}
          onKeyDown={userId && onOpenProfile ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSelf(); } } : undefined}
          className={userId && onOpenProfile ? 'focus-ring pressable' : undefined}
          style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: '18px', cursor: userId && onOpenProfile ? 'pointer' : 'default' }}
        >
          <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'var(--gradient-brand)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--brand-foreground)', fontSize: '22px', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>
              {name}
              {age && (
                <span style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '15px' }}> · {age}&nbsp;лет</span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '3px' }}>
              <span style={{ color: 'var(--brand-dark)', fontWeight: 700 }}>★ {rating.toFixed(1)}</span> · {tripCount}&nbsp;поездок
            </div>
          </div>
        </Card>
      )}

      {/* Меню одной карточкой */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <MenuRow
          onClick={onMyTrips}
          icon={<svg viewBox="0 0 24 24" style={navIconStyle}><path d="M4 3h16v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L4 21z" /><path d="M8 8h8M8 12h8M8 16h4" /></svg>}
          label="Мои поездки"
        />
        <MenuRow
          onClick={onMyCars}
          icon={<svg viewBox="0 0 24 24" style={navIconStyle}><path d="M5 11l1.7-4.3A2 2 0 0 1 8.6 5.4h6.8a2 2 0 0 1 1.9 1.3L19 11" /><rect x="3" y="11" width="18" height="6" rx="2.2" /><circle cx="7.5" cy="17.5" r="1.4" /><circle cx="16.5" cy="17.5" r="1.4" /></svg>}
          label={<>Мои машины{carsCount > 0 && <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}> · {carsCount}</span>}</>}
        />
        <MenuRow
          onClick={onLicenseReview}
          icon={<svg viewBox="0 0 24 24" style={navIconStyle}><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M13 9.5h5M13 13h4M6 15h6" /></svg>}
          label="Водительское удостоверение"
          right={licenseRight}
        />
        <MenuRow
          onClick={onSafety}
          icon={<svg viewBox="0 0 24 24" style={navIconStyle}><path d="M12 3l7 2.8v5.2c0 4.6-3.2 7.7-7 8.8-3.8-1.1-7-4.2-7-8.8V5.8z" /></svg>}
          label="Безопасность и SOS"
        />
        <MenuRow
          onClick={onToggleTheme}
          icon={theme === 'dark'
            ? <svg viewBox="0 0 24 24" style={navIconStyle}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>
            : <svg viewBox="0 0 24 24" style={navIconStyle}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
          label="Сменить тему"
          right={themeToggle}
          last
        />
      </Card>

      {/* Стать водителем */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
        {shouldShowDriverButton && (
          <Button variant="primary" icon="i-car" onClick={onBecomeDriver}>
            {driverButtonLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ProfileScreen;
