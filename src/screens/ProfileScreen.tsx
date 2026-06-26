import { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { showToast } from '../lib/toast';
import { getMyProfile, ApiException } from '../lib/api';
import type { UserProfile } from '../types/api';

// Демо-данные для браузера без Telegram (graceful fallback при 401).
const DEMO_PROFILE: UserProfile = {
  name: 'Никита Р.',
  age: 28,
  rating_avg: 4.9,
  rating_count: 23,
  trips_driver_count: 12,
  trips_passenger_count: 11,
  license_status: 'verified',
};

const statValueStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 800,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--muted-foreground)',
  fontWeight: 600,
  marginTop: '3px',
};

interface ProfileScreenProps {
  onBecomeDriver: () => void;
  onLicenseReview: () => void;
  /** Открыть экран «Безопасность и SOS» (экран 19). */
  onSafety?: () => void;
  /** Открыть экран «Мои поездки» (экран 17). */
  onMyTrips?: () => void;
  /** Открыть экран «Домой как вчера» (экран 24). */
  onHabitHome?: () => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBecomeDriver, onLicenseReview, onSafety, onMyTrips, onHabitHome }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const res = await getMyProfile();
        if (mounted) {
          setProfile(res.profile);
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof ApiException && err.status === 401) {
          if (mounted) {
            setProfile(DEMO_PROFILE);
            setLoading(false);
          }
        } else {
          if (mounted) {
            setProfile(DEMO_PROFILE);
            setLoading(false);
          }
        }
      }
    };

    loadProfile();
    return () => { mounted = false; };
  }, []);

  const avatar = profile ? profile.name.charAt(0).toUpperCase() : 'Н';
  const name = profile?.name ?? 'Загрузка…';
  const age = profile?.age ?? null;
  const rating = profile?.rating_avg ?? 0;
  const tripCount = (profile?.trips_driver_count ?? 0) + (profile?.trips_passenger_count ?? 0);
  const licenseVerified = profile?.license_status === 'verified';

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Header title="Профиль" />

      {loading ? (
        <Card style={{ display: 'flex', gap: '12px', alignItems: 'center', minHeight: '78px' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'var(--secondary)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                height: '16px',
                width: '60%',
                borderRadius: '8px',
                background: 'var(--secondary)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            <div
              style={{
                height: '12px',
                width: '40%',
                borderRadius: '6px',
                background: 'var(--secondary)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </Card>
      ) : (
        <>
          <Card style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Avatar label={avatar} rating={rating} size={54} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '17px', fontWeight: 700 }}>
                {name}
                {age && (
                  <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>
                    {' '}
                    · {age}&nbsp;лет
                  </span>
                )}
              </div>
              {licenseVerified ? (
                <div
                  style={{
                    color: 'var(--success)',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    marginTop: '5px',
                  }}
                >
                  <Icon id="i-check" style={{ width: '14px', height: '14px' }} />
                  ВУ подтверждено
                </div>
              ) : (
                <div
                  style={{
                    color: 'var(--muted-foreground)',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    marginTop: '5px',
                  }}
                >
                  <Icon id="i-shield" style={{ width: '14px', height: '14px' }} />
                  ВУ на проверке
                </div>
              )}
            </div>
          </Card>

          <Card style={{ display: 'flex', alignItems: 'stretch', padding: 0, overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '14px', textAlign: 'center' }}>
              <div style={{ ...statValueStyle, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Icon id="i-star" fill style={{ width: '14px', height: '14px', fill: 'var(--star)' }} />
                {rating.toFixed(1)}
              </div>
              <div style={statLabelStyle}>рейтинг</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }} />
            <div style={{ flex: 1, padding: '14px', textAlign: 'center' }}>
              <div style={statValueStyle}>{tripCount}</div>
              <div style={statLabelStyle}>поездок</div>
            </div>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Открыть статус водительского удостоверения"
            className="focus-ring pressable"
            onClick={onLicenseReview}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onLicenseReview();
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <div
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted-foreground)',
                fontWeight: 700,
                marginBottom: '8px',
              }}
            >
              Документы
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '12px',
                  background: 'var(--gradient-brand)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--brand-foreground)',
                  flexShrink: 0,
                  boxShadow: '0 8px 20px -10px rgba(255, 221, 45, .6)',
                }}
              >
                <Icon id="i-shield" style={{ width: '18px', height: '18px', strokeWidth: 2 }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>Водительское удостоверение</div>
                <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600, marginTop: '2px' }}>
                  {licenseVerified ? 'Подтверждено' : 'На проверке'}
                </div>
              </div>
              <Icon id="i-chev-r" style={{ width: '18px', height: '18px', color: 'var(--muted-foreground)' }} />
            </div>
          </Card>
        </>
      )}

      {/* Меню: мои поездки (экран 17), безопасность (экран 19), вечер домой (экран 24) */}
      <Card style={{ padding: '4px 6px' }}>
        <button
          type="button"
          className="focus-ring pressable"
          onClick={() => {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
            onMyTrips?.();
          }}
          style={{
            width: '100%',
            minHeight: '52px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
            borderRadius: '14px',
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '11px',
              background: 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon id="i-receipt" style={{ width: '17px', height: '17px' }} />
          </div>
          <span style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>Мои поездки</span>
          <Icon
            id="i-chev-r"
            style={{ width: '18px', height: '18px', color: 'var(--muted-foreground)' }}
          />
        </button>
        <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
        <button
          type="button"
          className="focus-ring pressable"
          onClick={() => {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
            onSafety?.();
          }}
          style={{
            width: '100%',
            minHeight: '52px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
            borderRadius: '14px',
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '11px',
              background: 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon id="i-shield" style={{ width: '17px', height: '17px' }} />
          </div>
          <span style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>Безопасность и SOS</span>
          <Icon
            id="i-chev-r"
            style={{ width: '18px', height: '18px', color: 'var(--muted-foreground)' }}
          />
        </button>
        <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
        <button
          type="button"
          className="focus-ring pressable"
          onClick={() => {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
            onHabitHome?.();
          }}
          style={{
            width: '100%',
            minHeight: '52px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
            borderRadius: '14px',
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '11px',
              background: 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon id="i-clock" style={{ width: '17px', height: '17px' }} />
          </div>
          <span style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>Вечер: домой как вчера</span>
          <Icon
            id="i-chev-r"
            style={{ width: '18px', height: '18px', color: 'var(--muted-foreground)' }}
          />
        </button>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
        <Button variant="primary" icon="i-car" onClick={onBecomeDriver}>
          Стать водителем
        </Button>
        <Button variant="ghost" icon="i-sliders" onClick={() => showToast('Настройки — скоро')}>
          Настройки
        </Button>
      </div>
    </div>
  );
};

export default ProfileScreen;
