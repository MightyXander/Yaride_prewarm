import { useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { hapticNotify } from '../lib/haptics';
import { showToast } from '../lib/toast';
import type { Trip, ConfirmKind } from '../types/navigation';

interface BookingConfirmedScreenProps {
  kind: ConfirmKind;
  trip: Trip | null;
  onDone: () => void;
  /** Только для publish: открыть список броней пассажиров на свой рейс. */
  onViewBookings?: () => void;
  /** Перейти на экран активной поездки (экран 9 «В пути»). Только для брони пассажира. */
  onStartTrip?: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const BookingConfirmedScreen: React.FC<BookingConfirmedScreenProps> = ({
  kind,
  trip,
  onDone,
  onViewBookings,
  onStartTrip,
}) => {
  // Экран успеха: тактильное подтверждение исхода при появлении.
  useEffect(() => {
    hapticNotify('success');
  }, []);

  const isPublish = kind === 'publish';
  const title = isPublish ? 'Поездка' : 'Бронь';
  const headline = isPublish ? 'Поездка опубликована!' : 'Ты в поездке!';
  const sub = isPublish
    ? 'Завтра, среда · выезд 7:40'
    : trip
      ? `Завтра, среда · выезд ${trip.time}`
      : 'Завтра, среда';

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
      <Header title={title} />

      {/* Успех */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '14px 8px 6px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '22px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--brand-foreground)',
            boxShadow: 'var(--shadow-hero)',
          }}
        >
          <Icon
            id={isPublish ? 'i-car' : 'i-check'}
            style={{ width: '30px', height: '30px', strokeWidth: 2.4 }}
          />
        </div>
        <div style={{ fontWeight: 800, fontSize: '19px', letterSpacing: '-0.01em', marginTop: '12px' }}>
          {headline}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '3px' }}>{sub}</div>
      </div>

      {/* Карточка водителя/поездки */}
      {!isPublish && trip ? (
        <Card>
          <div style={{ display: 'flex', gap: '13px', alignItems: 'center' }}>
            <div
              style={{
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
              {trip.driver.avatar}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{trip.driver.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                {trip.car}, белая · <b style={{ color: 'var(--foreground)' }}>123</b>
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '13px',
              fontWeight: 600,
              minHeight: '24px',
              marginTop: '11px',
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
            {trip.address}
          </div>
        </Card>
      ) : (
        <Card>
          <div style={sectionLabelStyle}>Опубликовано</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '11px',
                fontSize: '13px',
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
              Брагино, ул. Урицкого, 12
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
                fontSize: '13px',
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
              Центр, пл. Волкова
            </div>
          </div>
          <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '6px' }}>
            Выезд <b style={{ color: 'var(--foreground)' }}>7:40</b> · 2 места
          </div>
        </Card>
      )}

      {/* Действия координации */}
      {!isPublish && (
        <>
          <Button
            variant="secondary"
            icon="i-msg"
            onClick={() =>
              showToast(`Чат с ${trip ? trip.driver.name.split(' ')[0] : 'водителем'} — скоро`)
            }
          >
            Написать {trip ? trip.driver.name.split(' ')[0] : 'водителю'}
          </Button>
          <Button variant="ghost" icon="i-share">
            Поделиться с близким
          </Button>
        </>
      )}
      {isPublish && (
        <>
          {onViewBookings && (
            <Button variant="secondary" icon="i-user" onClick={onViewBookings}>
              Брони на рейс
            </Button>
          )}
          <Button variant="ghost" icon="i-share">
            Позвать попутчиков в чат района
          </Button>
        </>
      )}

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
          <Icon id="i-bell" style={{ width: '18px', height: '18px' }} />
        </div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          {isPublish ? (
            <>Пришлём пуш, как только кто-то забронирует место.</>
          ) : (
            <>
              Напомним вечером накануне. <b style={{ fontWeight: 700 }}>SOS</b> доступен в поездке.
            </>
          )}
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
        {!isPublish && onStartTrip && (
          <Button variant="secondary" icon="i-car" onClick={onStartTrip}>
            Открыть поездку «в пути»
          </Button>
        )}
        <Button variant="primary" onClick={onDone}>
          На главную
        </Button>
      </div>
    </div>
  );
};

export default BookingConfirmedScreen;
