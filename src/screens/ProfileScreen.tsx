import { useState, useEffect, type ReactNode } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import EmailLoginSection from '../components/EmailLoginSection';
import ThemeModeSheet from '../components/ThemeModeSheet';
import type { ThemeMode } from '../hooks/useTheme';
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
  /** Открыть экран «Мои заявки» (активные заявки на маршрут, issue #321). */
  onMyAlerts?: () => void;
  /** Текущий режим темы (light/dark/system) — паритет с Android. */
  themeMode?: ThemeMode;
  /** Выбрать режим темы. */
  onSetThemeMode?: (mode: ThemeMode) => void;
  /** Текущая (разрешённая) тема — для иконки строки. */
  theme?: 'light' | 'dark';
  /** Открыть публичный профиль пользователя. */
  onOpenProfile?: (userId: number) => void;
  /** Выйти из браузерной сессии (показывается только для браузерных аккаунтов). */
  onLogout?: () => void;
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

// Единая строка меню: фиксированная высота (все строки визуально равны, даже с
// тумблером/статусом справа) + разделитель с отступом слева под текст (iOS-groped
// стиль). Разделитель не доходит до скруглённых углов карточки, поэтому крайние
// строки больше не «кажутся» другой высоты. Идентично Flutter-версии (_MenuRow).
const MENU_ROW_HEIGHT = 56;
const MENU_DIVIDER_INSET = 48; // 16 (паддинг) + 20 (иконка) + 12 (gap) — под лейбл

const MenuRow: React.FC<MenuRowProps> = ({ icon, label, onClick, right, last }) => (
  <button
    type="button"
    className="focus-ring pressable"
    onClick={() => {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      onClick?.();
    }}
    style={{
      position: 'relative',
      width: '100%',
      minHeight: `${MENU_ROW_HEIGHT}px`,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '0 16px',
      background: 'transparent',
      border: 'none',
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
    {!last && (
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: `${MENU_DIVIDER_INSET}px`,
          right: 0,
          bottom: 0,
          height: '1px',
          background: 'var(--border)',
        }}
      />
    )}
  </button>
);

// Короткая подпись режима темы для строки меню (паритет с Android themeModeLabel).
const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  light: 'Светлая',
  dark: 'Тёмная',
  system: 'Авто',
};

const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBecomeDriver, onLicenseReview, onSafety, onMyTrips, onMyCars, onMyAlerts, themeMode = 'system', onSetThemeMode, theme, onOpenProfile, onLogout }) => {
  const { profile, loading, needsTelegram, refetch } = useProfile();
  const [carsCount, setCarsCount] = useState(0);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);

  // Профиль живёт в контексте (не размонтируется), поэтому при заходе на экран
  // тихо перезапрашиваем — чтобы статус ВУ (одобрение админом) и счётчики были
  // свежими без перезагрузки. Рефетч stale-while-revalidate, без мигания скелета.
  useEffect(() => {
    void refetch();
    // Только на маунте экрана профиля; refetch стабилен по смыслу (loadProfile).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Правый слот строки «Сменить тему»: текущий режим + шеврон (открывает лист выбора).
  // Паритет с Android — вместо тумблера light/dark выбор из трёх режимов в нижнем листе.
  const themeRight = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted-foreground)' }}>
        {THEME_MODE_LABEL[themeMode]}
      </span>
      <ChevronRight />
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
      ) : !profile ? (
        // Вне Telegram / 401 без засиженного профиля — честная карточка-баннер
        // вместо выдуманных данных (#244). Меню навигации ниже остаётся видимым.
        <Card style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: '18px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'var(--secondary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" style={{ width: '28px', height: '28px', fill: 'none', stroke: 'var(--muted-foreground)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
              <path d="M21 5 2 12l7 2 2 7 3-5 5 4z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Откройте в Telegram</div>
            <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.4 }}>
              {needsTelegram
                ? 'Профиль доступен после входа через Telegram. Откройте приложение в боте @Yaride_bot.'
                : 'Не удалось загрузить профиль. Откройте приложение в боте @Yaride_bot.'}
            </div>
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
          onClick={onMyAlerts}
          icon={<svg viewBox="0 0 24 24" style={navIconStyle}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>}
          label="Мои заявки"
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
          onClick={() => setThemeSheetOpen(true)}
          icon={theme === 'dark'
            ? <svg viewBox="0 0 24 24" style={navIconStyle}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>
            : <svg viewBox="0 0 24 24" style={navIconStyle}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
          label="Сменить тему"
          right={themeRight}
          last
        />
      </Card>

      {/* Вход по email (issue #273): только в Telegram и только аккаунту без пароля.
          Видимостью управляет сам компонент (см. EmailLoginSection). */}
      <EmailLoginSection />

      {/* Стать водителем */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
        {shouldShowDriverButton && (
          <Button variant="primary" icon="i-car" onClick={onBecomeDriver}>
            {driverButtonLabel}
          </Button>
        )}
        {onLogout && (
          <Button variant="ghost" onClick={onLogout}>
            Выйти
          </Button>
        )}
      </div>

      <ThemeModeSheet
        open={themeSheetOpen}
        mode={themeMode}
        onSelect={(m) => onSetThemeMode?.(m)}
        onClose={() => setThemeSheetOpen(false)}
      />
    </div>
  );
};

export default ProfileScreen;
