import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { Icon } from '../components/Icons';
import { hapticNotify } from '../lib/haptics';
import type { Trip } from '../types/navigation';

// Экран 14 SPEC: Алерт сработал (пуш)
// Карточка появившейся подходящей поездки из подписки.
// Показываем push-уведомление + карточку поездки + действие.

interface AlertPushScreenProps {
  trip?: Trip;
  onBook?: () => void;
}

const AlertPushScreen: React.FC<AlertPushScreenProps> = ({ trip, onBook }) => {
  // Рыба-данные для демо (экран 14 из мокапа: Марина С., обратный маршрут Центр → Брагино)
  const driverName = trip?.driver.name || 'Марина С.';
  const driverAvatar = trip?.driver.avatar || 'М';
  const driverRating = trip?.driver.rating || 5.0;
  const driverTripCount = trip?.driver.tripCount || 12;
  const address = trip?.address || 'от пл. Волкова';
  const car = trip?.car || 'VW Polo';
  const price = trip?.price || '70';
  const time = trip?.time || '17:40';
  const seats = trip?.seats || 3;

  const handleBook = () => {
    hapticNotify('success');
    onBook?.();
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        justifyContent: 'flex-start',
      }}
    >
      {/* Push-уведомление */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '13px 14px',
          boxShadow: 'var(--shadow-elevated)',
          display: 'flex',
          gap: '11px',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '11px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--brand-foreground)',
            fontSize: '15px',
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          Y
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Icon id="i-bell" style={{ width: '14px', color: 'var(--brand)' }} />
            Yaride · сейчас
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--foreground)',
              marginTop: '3px',
              lineHeight: 1.4,
            }}
          >
            Появилась поездка по твоему маршруту{' '}
            <b style={{ fontWeight: 700 }}>Центр → Брагино</b> на {time}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--muted-foreground)',
          fontWeight: 700,
          marginTop: '14px',
        }}
      >
        По твоей заявке
      </div>

      {/* Карточка поездки */}
      <Card style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
        <Avatar label={driverAvatar} rating={driverRating} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {driverName}{' '}
            <span
              style={{
                color: 'var(--star)',
                fontWeight: 700,
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <Icon id="i-star" fill style={{ width: '11px', height: '11px' }} />
              {driverRating}
            </span>{' '}
            <span
              style={{
                color: 'var(--muted-foreground)',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              {driverTripCount}
            </span>
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '3px',
              lineHeight: 1.55,
            }}
          >
            {address} · {car} · ≈{price} ₽
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            width: '54px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '6px',
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: '16px',
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {time}
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--brand-foreground)',
              background: 'var(--brand)',
              padding: '3px 10px',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
            }}
          >
            {seats} места
          </span>
        </div>
      </Card>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary" onClick={handleBook}>
          Открыть и забронировать
        </Button>
      </div>
    </div>
  );
};

export default AlertPushScreen;
