import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import PhoneLink from '../components/PhoneLink';
import { showToast } from '../lib/toast';
import { getTripBookings, cancelBookingByDriver, ApiException } from '../lib/api';
import type { BookingDetail } from '../types/api';

interface DriverBookingsScreenProps {
  tripId?: number;
  onDone: () => void;
}

// Рыба-данные на случай отсутствия tripId
const FALLBACK_TOTAL_SEATS = 3;

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

const statusPill = (status: string): React.ReactNode => {
  if (status === 'active') {
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
        Активна
      </span>
    );
  }
  if (status === 'cancelled_by_driver') {
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
        Отклонена
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--muted-foreground)',
      }}
    >
      {status}
    </span>
  );
};

const DriverBookingsScreen: React.FC<DriverBookingsScreenProps> = ({ tripId, onDone }) => {
  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      setError('ID поездки не передан');
      return;
    }

    const loadBookings = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getTripBookings(tripId);
        setBookings(response.bookings);
      } catch (err) {
        const msg = err instanceof ApiException ? err.message : 'Ошибка загрузки броней';
        setError(msg);
        showToast(msg);
      } finally {
        setLoading(false);
      }
    };

    void loadBookings();
  }, [tripId]);

  const handleCancelBooking = async (bookingId: number) => {
    try {
      setCancelling(bookingId);
      await cancelBookingByDriver(bookingId);
      setBookings((prev) =>
        prev.map((b) =>
          b.booking_id === bookingId ? { ...b, status: 'cancelled_by_driver' } : b,
        ),
      );
      showToast('Бронь отклонена');
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Ошибка отклонения брони';
      showToast(msg);
    } finally {
      setCancelling(null);
    }
  };

  const activeBookings = bookings.filter((b) => b.status === 'active');
  const takenSeats = activeBookings.reduce((sum, b) => sum + b.seats, 0);
  const totalSeats = FALLBACK_TOTAL_SEATS;
  const seatsLeft = Math.max(0, totalSeats - takenSeats);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div style={{ fontSize: '15px', color: 'var(--muted-foreground)' }}>
          Загрузка броней...
        </div>
      </div>
    );
  }

  if (error) {
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
        <Header title="Мои брони" />
        <Card variant="accent" style={{ borderColor: 'var(--destructive)', background: 'var(--destructive-background, var(--secondary))' }}>
          <div style={{ fontSize: '15px', lineHeight: 1.5, color: 'var(--destructive)' }}>
            {error}
          </div>
        </Card>
        <Button variant="ghost" onClick={onDone}>
          Назад
        </Button>
      </div>
    );
  }

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
        title="Мои брони"
        subtitle={`${takenSeats} из ${totalSeats} занято`}
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
            onClick={() => showToast('Редактирование — скоро')}
          >
            <Icon id="i-edit" style={{ width: '16px', height: '16px' }} />
          </button>
        }
      />

      {bookings.length === 0 && (
        <Card>
          <div style={{ fontSize: '15px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '20px' }}>
            Пока нет броней
          </div>
        </Card>
      )}

      {bookings.map((b) => (
        <Card key={b.booking_id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <Avatar label={b.passenger_name.charAt(0)} rating={0} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 700 }}>
              {b.passenger_name}
              {b.passenger_username && (
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                  @{b.passenger_username}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              {b.seats} {b.seats === 1 ? 'место' : b.seats < 5 ? 'места' : 'мест'}
            </div>

            {b.status === 'active' && b.passenger_phone && (
              <div style={{ marginTop: '8px' }}>
                <PhoneLink phone={b.passenger_phone} name={b.passenger_name} />
              </div>
            )}

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
              {b.status === 'active' ? (
                <>
                  {statusPill(b.status)}
                  <button
                    type="button"
                    className="focus-ring pressable"
                    onClick={() => handleCancelBooking(b.booking_id)}
                    disabled={cancelling === b.booking_id}
                    style={{ ...linkBtnStyle, color: 'var(--muted-foreground)' }}
                  >
                    {cancelling === b.booking_id ? 'Отклоняем...' : 'Отклонить'}
                  </button>
                  <button
                    type="button"
                    className="focus-ring pressable"
                    aria-label={`Написать ${b.passenger_name}`}
                    onClick={() => showToast(`Чат с ${b.passenger_name} — скоро`)}
                    style={linkBtnStyle}
                  >
                    <Icon id="i-msg" style={{ width: '14px', height: '14px' }} />
                    Написать
                  </button>
                </>
              ) : (
                statusPill(b.status)
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
