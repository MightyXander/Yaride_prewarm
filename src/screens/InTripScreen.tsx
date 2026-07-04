import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { hapticNotify } from '../lib/haptics';
import { showToast } from '../lib/toast';
import { getTripParticipants } from '../lib/api';
import type { TripParticipant } from '../types/api';
import type { Trip } from '../types/navigation';

interface InTripScreenProps {
  trip: Trip | null;
  onOpenProfile?: (userId: number) => void;
}

// Рыба-данные активной поездки (используется, если selectedTrip не передан).
const FALLBACK_TRIP = {
  driver: { name: 'Андрей К.', rating: 4.9, avatar: 'А' },
  car: 'Kia Rio',
  eta: '~18 мин до места',
};

const InTripScreen: React.FC<InTripScreenProps> = ({ trip, onOpenProfile }) => {
  const driverName = trip?.driver.name ?? FALLBACK_TRIP.driver.name;
  const driverRating = trip?.driver.rating ?? FALLBACK_TRIP.driver.rating;
  const driverAvatar = trip?.driver.avatar ?? FALLBACK_TRIP.driver.avatar;
  const car = trip?.car ?? FALLBACK_TRIP.car;
  const eta = trip?.route?.duration ? `~${trip.route.duration} до места` : FALLBACK_TRIP.eta;

  const driverId = trip?.driver.id;
  const driverClickable = !!driverId && !!onOpenProfile;
  const openDriverProfile = () => {
    if (!driverId || !onOpenProfile) return;
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    onOpenProfile(driverId);
  };

  // Попутчики видны только участникам поездки (водитель своей поездки или забронировавший пассажир).
  const canSeeParticipants = !!trip && (trip.isOwn || trip.booked === true);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  useEffect(() => {
    const tripId = Number(trip?.id);
    if (!canSeeParticipants || !Number.isFinite(tripId)) {
      setParticipants([]);
      return;
    }
    let cancelled = false;
    setLoadingParticipants(true);
    getTripParticipants(tripId)
      .then((res) => {
        if (!cancelled) setParticipants(res.participants);
      })
      .catch((err) => {
        console.error('Ошибка загрузки участников поездки:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingParticipants(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.id, canSeeParticipants]);

  const handleOpenParticipant = (userId: number) => {
    if (!onOpenProfile) return;
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    onOpenProfile(userId);
  };

  const [shared, setShared] = useState(false);
  const [sosArmed, setSosArmed] = useState(false);

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
      <Header
        title="В пути"
        subtitle="Брагино → Центр"
        right={
          <button
            type="button"
            aria-label="Координация поездки"
            className="focus-ring pressable"
            onClick={() => {
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
            }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '11px',
              background: 'var(--secondary)',
              border: 'none',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              color: 'var(--foreground)',
              flexShrink: 0,
            }}
          >
            <Icon id="i-more" style={{ width: '18px', height: '18px' }} />
          </button>
        }
      />

      {/* Карта-маршрут со статусом «в пути» и ETA */}
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background:
            'radial-gradient(120% 90% at 80% 0%, color-mix(in srgb, var(--brand) 14%, transparent) 0%, transparent 60%), var(--elevated)',
          boxShadow: 'var(--shadow-card)',
          height: '150px',
        }}
      >
        <svg
          viewBox="0 0 280 122"
          fill="none"
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          preserveAspectRatio="xMidYMid slice"
        >
          <path
            d="M20 98 C80 72 120 52 160 56 S240 42 262 24"
            stroke="var(--brand)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="2 9"
          />
          <circle cx="20" cy="98" r="5" fill="var(--brand)" />
          <circle cx="262" cy="24" r="5" fill="var(--foreground)" />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: '12px',
            top: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 11px',
            borderRadius: '999px',
            background: 'color-mix(in srgb, var(--elevated) 92%, transparent)',
            border: '1px solid var(--border)',
            fontSize: '12px',
            fontWeight: 700,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Icon id="i-clock" style={{ width: '13px', height: '13px', color: 'var(--brand-dark)' }} />
          {eta}
        </div>
      </div>

      {/* Водитель и статус «в пути» */}
      <Card style={{ display: 'flex', gap: '13px', alignItems: 'center' }}>
        <div
          role={driverClickable ? 'button' : undefined}
          tabIndex={driverClickable ? 0 : undefined}
          aria-label={driverClickable ? `Открыть профиль ${driverName}` : undefined}
          onClick={driverClickable ? openDriverProfile : undefined}
          onKeyDown={
            driverClickable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDriverProfile();
                  }
                }
              : undefined
          }
          className={driverClickable ? 'focus-ring pressable' : undefined}
          style={{
            display: 'flex',
            gap: '13px',
            alignItems: 'center',
            minWidth: 0,
            flex: 1,
            cursor: driverClickable ? 'pointer' : 'default',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'var(--gradient-brand)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              color: 'var(--brand-foreground)',
              fontSize: '18px',
              flexShrink: 0,
            }}
          >
            {driverAvatar}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {driverName}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '14px',
                fontWeight: 700,
              }}
            >
              <Icon id="i-star" fill style={{ width: '12px', height: '12px', fill: 'var(--star)' }} />
              {driverRating}
            </span>
          </div>
            <div style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              {car}, белая ·{' '}
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>в пути</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label={`Написать ${driverName}`}
          className="focus-ring pressable"
          onClick={() => {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
            showToast(`Чат с ${driverName} — скоро`);
          }}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '13px',
            background: 'var(--secondary)',
            border: 'none',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            color: 'var(--foreground)',
            flexShrink: 0,
          }}
        >
          <Icon id="i-msg" style={{ width: '18px', height: '18px' }} />
        </button>
      </Card>

      {/* Попутчики — компактный список, тап открывает публичный профиль */}
      {canSeeParticipants && (participants.length > 0 || loadingParticipants) && (
        <Card>
          <div
            style={{
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--muted-foreground)',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            Кто едет
          </div>
          {loadingParticipants && participants.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Загрузка…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {participants.map((p) => {
                const clickable = !!onOpenProfile;
                return (
                  <div
                    key={p.user_id}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable ? `Открыть профиль ${p.name}` : undefined}
                    onClick={clickable ? () => handleOpenParticipant(p.user_id) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenParticipant(p.user_id);
                            }
                          }
                        : undefined
                    }
                    className={clickable ? 'focus-ring pressable' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: clickable ? 'pointer' : 'default',
                    }}
                  >
                    <Avatar label={p.name.charAt(0)} rating={p.rating || undefined} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{p.name}</div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--muted-foreground)',
                          marginTop: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <span>{p.role === 'driver' ? 'Водитель' : 'Попутчик'}</span>
                        {p.rating_count > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            ·
                            <Icon id="i-star" fill style={{ width: '10px', height: '10px', fill: 'var(--star)' }} />
                            {p.rating}
                          </span>
                        )}
                        {p.license_verified && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--success)', fontWeight: 700 }}>
                            · <Icon id="i-check" style={{ width: '12px', height: '12px' }} /> ВУ
                          </span>
                        )}
                      </div>
                    </div>
                    {clickable && (
                      <Icon
                        id="i-arrow-r"
                        style={{ width: '16px', height: '16px', marginLeft: 'auto', color: 'var(--muted-foreground)' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Объяснение «поделиться» */}
      <Card variant="accent" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
          }}
        >
          <Icon id="i-pin" style={{ width: '18px', height: '18px' }} />
        </div>
        <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          Поездкой можно поделиться — близкий видит маршрут и машину в реальном времени.
        </div>
      </Card>

      {/* Действия: поделиться + крупная SOS */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <button
          type="button"
          className="focus-ring pressable"
          aria-pressed={shared}
          onClick={() => {
            setShared(true);
            hapticNotify('success');
          }}
          style={{
            minHeight: '48px',
            padding: '10px 16px',
            borderRadius: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontWeight: 600,
            fontSize: '15px',
            border: '1px solid var(--border)',
            background: shared ? 'var(--accent)' : 'transparent',
            color: 'var(--foreground)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <Icon id={shared ? 'i-check' : 'i-share'} style={{ width: '18px', height: '18px' }} />
          {shared ? 'Поездкой поделились' : 'Поделиться поездкой'}
        </button>

        <button
          type="button"
          className="focus-ring pressable"
          aria-label={sosArmed ? 'Подтвердить вызов помощи' : 'Кнопка SOS — вызвать помощь'}
          onClick={() => {
            hapticNotify(sosArmed ? 'error' : 'warning');
            setSosArmed((v) => !v);
          }}
          style={{
            minHeight: '60px',
            padding: '12px 16px',
            borderRadius: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontWeight: 800,
            fontSize: '16px',
            letterSpacing: '0.01em',
            border: 'none',
            background: 'var(--gradient-danger)',
            color: 'var(--danger-foreground)',
            boxShadow: 'var(--shadow-danger)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <Icon id="i-sos" style={{ width: '22px', height: '22px', strokeWidth: 2.2 }} />
          {sosArmed ? 'Нажми ещё раз — вызвать 112' : 'SOS — вызвать помощь'}
        </button>
        {sosArmed && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            Позвоним 112 и отправим геопозицию доверенному контакту.{' '}
            <button
              type="button"
              className="focus-ring"
              onClick={() => setSosArmed(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--foreground)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                padding: '2px 4px',
                fontFamily: 'var(--font-sans)',
                textDecoration: 'underline',
              }}
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InTripScreen;
