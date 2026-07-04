import Card from './ui/Card';
import Avatar from './ui/Avatar';
import { Icon } from './Icons';
import PhoneLink from './PhoneLink';
import type { BookingDetail } from '../types/api';

/**
 * Карточка брони пассажира в секции «Брони» водительского TripDetailsScreen
 * (issue #339). Перенесена из удалённого DriverBookingsScreen: аватар,
 * имя/@username, телефон (для активной брони), статус, действия
 * «Подтвердить»/«Отклонить».
 *
 * `confirmed` — локальный (не персистится на бэке: в схеме bookings нет
 * отдельного статуса подтверждения, см. confirmBookingByDriver) признак того,
 * что водитель уже нажал «Подтвердить» в этой сессии — прячет кнопку
 * подтверждения, оставляя «Отклонить» доступной.
 */
export interface BookingCardProps {
  booking: BookingDetail;
  confirmed: boolean;
  confirming: boolean;
  declining: boolean;
  onConfirm: (bookingId: number) => void;
  onDecline: (bookingId: number) => void;
}

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  minHeight: '40px',
  padding: '6px 14px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--foreground)',
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
};

const confirmBtnStyle: React.CSSProperties = {
  ...linkBtnStyle,
  border: '1px solid transparent',
  background: 'var(--success)',
  color: 'var(--success-foreground)',
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
    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)' }}>{status}</span>
  );
};

const BookingCard: React.FC<BookingCardProps> = ({
  booking,
  confirmed,
  confirming,
  declining,
  onConfirm,
  onDecline,
}) => {
  const isActive = booking.status === 'active';

  return (
    <Card data-booking-id={booking.booking_id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <Avatar label={booking.passenger_name.charAt(0)} rating={0} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 700 }}>
          {booking.passenger_name}
          {booking.passenger_username && (
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
              @{booking.passenger_username}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
          {booking.seats} {booking.seats === 1 ? 'место' : booking.seats < 5 ? 'места' : 'мест'}
        </div>

        {isActive && booking.passenger_phone && (
          <div style={{ marginTop: '8px' }}>
            <PhoneLink phone={booking.passenger_phone} name={booking.passenger_name} />
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
          {!isActive ? (
            statusPill(booking.status)
          ) : confirmed ? (
            <>
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
                Подтверждено
              </span>
              <button
                type="button"
                className="focus-ring pressable"
                onClick={() => onDecline(booking.booking_id)}
                disabled={declining}
                style={{ ...linkBtnStyle, color: 'var(--muted-foreground)' }}
              >
                {declining ? 'Отклоняем…' : 'Отклонить'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="focus-ring pressable"
                onClick={() => onDecline(booking.booking_id)}
                disabled={declining || confirming}
                style={{ ...linkBtnStyle, color: 'var(--muted-foreground)' }}
              >
                {declining ? 'Отклоняем…' : 'Отклонить'}
              </button>
              <button
                type="button"
                className="focus-ring pressable"
                onClick={() => onConfirm(booking.booking_id)}
                disabled={confirming || declining}
                style={confirmBtnStyle}
              >
                {confirming ? 'Подтверждаем…' : 'Подтвердить'}
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};

export default BookingCard;
