import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import Header from '../components/Header';
import { Icon } from '../components/Icons';

interface DriverBookingsScreenProps {
  onDone: () => void;
}

// Статусы брони пассажира на рейс водителя.
type BookingStatus = 'pending' | 'accepted' | 'declined';

interface PassengerBooking {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  tripCount: number;
  pickup: string;
  status: BookingStatus;
}

// Рыба-данные броней пассажиров на поездку 7:40.
const INITIAL_BOOKINGS: PassengerBooking[] = [
  {
    id: 'b1',
    name: 'Дмитрий',
    avatar: 'Д',
    rating: 4.8,
    tripCount: 21,
    pickup: 'ул. Урицкого, 12',
    status: 'accepted',
  },
  {
    id: 'b2',
    name: 'Елена',
    avatar: 'Е',
    rating: 5.0,
    tripCount: 9,
    pickup: 'пр-т Дзержинского, 8',
    status: 'pending',
  },
];

const TOTAL_SEATS = 3;

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  minHeight: '44px',
  padding: '6px 12px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--foreground)',
  fontSize: '12px',
  fontWeight: 700,
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
};

const statusPill = (status: BookingStatus): React.ReactNode => {
  if (status === 'accepted') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--success)',
        }}
      >
        <Icon id="i-check" style={{ width: '13px', height: '13px', strokeWidth: 2.4 }} />
        Принят
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--muted-foreground)',
      }}
    >
      <Icon id="i-x" style={{ width: '13px', height: '13px', strokeWidth: 2.4 }} />
      Отклонён
    </span>
  );
};

const DriverBookingsScreen: React.FC<DriverBookingsScreenProps> = ({ onDone }) => {
  const [bookings, setBookings] = useState<PassengerBooking[]>(INITIAL_BOOKINGS);

  const setStatus = (id: string, status: BookingStatus) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
  };

  const takenSeats = bookings.filter((b) => b.status === 'accepted').length;
  const seatsLeft = Math.max(0, TOTAL_SEATS - takenSeats);

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
        title="Моя поездка 7:40"
        subtitle={`Брагино → Центр · ${takenSeats} из ${TOTAL_SEATS} занято`}
        right={
          <button
            type="button"
            aria-label="Редактировать поездку"
            className="focus-ring pressable"
            style={{
              width: '32px',
              height: '32px',
              flexShrink: 0,
              borderRadius: '11px',
              border: '1px solid var(--border)',
              background: 'var(--secondary)',
              color: 'var(--foreground)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon id="i-edit" style={{ width: '16px', height: '16px' }} />
          </button>
        }
      />

      {bookings.map((b) => (
        <Card key={b.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <Avatar label={b.avatar} rating={b.rating} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 700 }}>
              {b.name}
              <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                · {b.tripCount} поездок
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              {b.pickup}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginTop: '9px',
                flexWrap: 'wrap',
              }}
            >
              {b.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="focus-ring pressable"
                    onClick={() => setStatus(b.id, 'declined')}
                    style={{ ...linkBtnStyle, color: 'var(--muted-foreground)' }}
                  >
                    Отклонить
                  </button>
                  <button
                    type="button"
                    className="focus-ring pressable"
                    onClick={() => setStatus(b.id, 'accepted')}
                    disabled={seatsLeft === 0}
                    style={{
                      ...linkBtnStyle,
                      border: 'none',
                      background: seatsLeft === 0 ? 'var(--secondary)' : 'var(--brand)',
                      color: seatsLeft === 0 ? 'var(--muted-foreground)' : 'var(--brand-foreground)',
                      cursor: seatsLeft === 0 ? 'not-allowed' : 'pointer',
                      opacity: seatsLeft === 0 ? 0.6 : 1,
                      flex: 1,
                    }}
                  >
                    <Icon id="i-check" style={{ width: '14px', height: '14px', strokeWidth: 2.4 }} />
                    Принять
                  </button>
                </>
              ) : (
                <>
                  {statusPill(b.status)}
                  {b.status === 'declined' && (
                    <button
                      type="button"
                      className="focus-ring pressable"
                      onClick={() => setStatus(b.id, 'pending')}
                      style={{ ...linkBtnStyle, color: 'var(--muted-foreground)' }}
                    >
                      Вернуть
                    </button>
                  )}
                  <button
                    type="button"
                    className="focus-ring pressable"
                    aria-label={`Написать ${b.name}`}
                    style={linkBtnStyle}
                  >
                    <Icon id="i-msg" style={{ width: '14px', height: '14px' }} />
                    Написать
                  </button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}

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
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }} aria-live="polite">
          Новые заявки приходят пушем.{' '}
          {seatsLeft > 0 ? (
            <>
              Осталось <b style={{ fontWeight: 700 }}>{seatsLeft} {seatsLeft === 1 ? 'место' : 'места'}</b>.
            </>
          ) : (
            <b style={{ fontWeight: 700 }}>Все места заняты.</b>
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
        <Button variant="ghost" onClick={onDone}>
          Снять поездку с публикации
        </Button>
      </div>
    </div>
  );
};

export default DriverBookingsScreen;
