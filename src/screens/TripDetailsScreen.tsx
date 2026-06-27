import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { showToast } from '../lib/toast';
import { Appear } from '../components/Appear';
import type { Trip } from '../types/navigation';

interface TripDetailsScreenProps {
  trip: Trip;
  onBook: () => void;
}

const TripDetailsScreen: React.FC<TripDetailsScreenProps> = ({ trip, onBook }) => {
  const age = trip.driver.age || 34;
  const verified = trip.driver.verified !== false;
  const memberSince = trip.driver.memberSince || 'мая 2026';

  const handleBook = () => {
    if (trip.isOwn) {
      showToast('Нельзя забронировать свою поездку');
      return;
    }
    onBook();
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
      }}
    >
      <Header title={`Поездка ${trip.time}`} />

      <Appear delay={0}>
        <Card
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <Avatar label={trip.driver.avatar} rating={trip.driver.rating} size={54} />
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>{trip.driver.name}</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '3px',
              lineHeight: 1.4,
            }}
          >
            <span
              style={{
                color: 'var(--brand)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <Icon id="i-star" fill style={{ width: '11px', height: '11px', fill: 'var(--star)' }} />
              {trip.driver.rating}
            </span>{' '}
            · {trip.driver.tripCount}&nbsp;поездок · {age}&nbsp;года
          </div>
          {verified && (
            <div
              style={{
                color: 'var(--success)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                marginTop: '4px',
              }}
            >
              <Icon id="i-check" style={{ width: '14px', height: '14px' }} />
              ВУ подтверждено · с {memberSince}
            </div>
          )}
        </div>
        </Card>
      </Appear>

      <Appear delay={50}>
        <Card>
        <div
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '6px',
          }}
        >
          Маршрут · ~{trip.route?.duration || '22 мин'}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            margin: '4px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '15px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <span
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                background: 'var(--brand)',
                flexShrink: 0,
              }}
            />
            {trip.route?.from || `Брагино, ${trip.address}`}
          </div>
          <div
            style={{
              height: '16px',
              borderLeft: '2px dotted var(--muted-foreground)',
              marginLeft: '4.5px',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '15px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <span
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                flexShrink: 0,
              }}
            />
            {trip.route?.to || 'Центр, пл. Волкова'}
          </div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
        <div
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            marginTop: '9px',
            lineHeight: 1.5,
          }}
        >
          Выезд&nbsp;&nbsp;<b style={{ color: 'var(--foreground)', fontWeight: 700 }}>среда, {trip.time}</b>
          <br />
          Машина&nbsp;&nbsp;<b style={{ color: 'var(--foreground)', fontWeight: 700 }}>{trip.car}, белая</b>
          <br />
          Бензин&nbsp;&nbsp;<b style={{ color: 'var(--foreground)', fontWeight: 700 }}>≈ {trip.price} ₽</b>{' '}
          <span style={{ color: 'var(--muted-foreground)' }}>(пополам · не оплата)</span>
        </div>
        </Card>
      </Appear>

      <Appear delay={100}>
        <Card
        variant="accent"
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
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
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          Бензин ≈{trip.price} ₽ пополам — как подсказка для расчётов. Это информационный сервис, без платежей в
          приложении.
        </div>
        </Card>
      </Appear>

      <Appear delay={150}>
        <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button
          variant="primary"
          onClick={handleBook}
          style={{
            ...(trip.isOwn && {
              opacity: 0.5,
              background: 'var(--muted)',
              color: 'var(--muted-foreground)',
              cursor: 'not-allowed',
            }),
          }}
        >
          Забронировать место
        </Button>
        <Button variant="ghost" icon="i-share" style={{ minHeight: '44px' }}>
          Поделиться поездкой
        </Button>
        </div>
      </Appear>
    </div>
  );
};

export default TripDetailsScreen;
