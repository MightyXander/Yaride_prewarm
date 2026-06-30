import { useState } from 'react';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { RouteDot, RouteMidConnector } from '../components/ui/RouteConnector';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { showToast } from '../lib/toast';
import { Appear } from '../components/Appear';
import type { Trip } from '../types/navigation';

interface TripDetailsScreenProps {
  trip: Trip;
  onBook: () => void;
  onOpenProfile?: (userId: number) => void;
  /** Отменить всю поездку (доступно водителю своей поездки). */
  onCancelTrip?: () => void;
}

// Бэйдж госномера — общий контейнер для реального номера и цензуры.
const plateBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '19px',
  padding: '0 7px',
  gap: '3px',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  background: 'color-mix(in srgb, var(--foreground) 6%, var(--card))',
  fontWeight: 800,
  fontSize: '11px',
  letterSpacing: '0.03em',
  color: 'var(--foreground)',
  fontVariantNumeric: 'tabular-nums',
  verticalAlign: 'middle',
};

/** Замазанный номер: бэйдж с «шумной» серой цензурой (квадраты разной плотности). */
const CensoredPlate: React.FC = () => {
  // Разная прозрачность создаёт эффект шума, как у зацензуренного текста.
  const blocks = [0.55, 0.32, 0.5, 0.6, 0.38, 0.52];
  return (
    <span style={plateBadgeStyle} aria-label="Номер скрыт до бронирования" role="img">
      {blocks.map((o, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: '6px',
            height: '11px',
            borderRadius: '1.5px',
            background: `color-mix(in srgb, var(--muted-foreground) ${Math.round(o * 100)}%, transparent)`,
          }}
        />
      ))}
    </span>
  );
};

const TripDetailsScreen: React.FC<TripDetailsScreenProps> = ({ trip, onBook, onOpenProfile, onCancelTrip }) => {
  const age = trip.driver.age || 34;
  const verified = trip.driver.verified !== false;
  const memberSince = trip.driver.memberSince || 'мая 2026';
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Дата+время выезда (для дня недели и определения прошедшей поездки).
  const departedAt = trip.tripDate ? new Date(`${trip.tripDate}T${trip.time}:00`) : null;
  const weekday = departedAt ? departedAt.toLocaleDateString('ru-RU', { weekday: 'long' }) : null;
  // Поездка завершена/отменена либо время выезда уже прошло — отменять нельзя.
  const isPast =
    trip.status === 'completed' ||
    trip.status === 'cancelled' ||
    (departedAt ? departedAt.getTime() < Date.now() : false);

  const handleBook = () => {
    if (trip.isOwn) {
      showToast('Нельзя забронировать свою поездку');
      return;
    }
    onBook();
  };

  const handleConfirmCancel = () => {
    setCancelling(true);
    onCancelTrip?.();
  };

  const handleAvatarClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const driverId = (trip.driver as { id?: number }).id;
    if (driverId && onOpenProfile) {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      onOpenProfile(driverId);
    }
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
        <div
          role={(trip.driver as { id?: number }).id && onOpenProfile ? 'button' : undefined}
          tabIndex={(trip.driver as { id?: number }).id && onOpenProfile ? 0 : undefined}
          aria-label={(trip.driver as { id?: number }).id && onOpenProfile ? `Открыть профиль ${trip.driver.name}` : undefined}
          onClick={(trip.driver as { id?: number }).id && onOpenProfile ? handleAvatarClick : undefined}
          onKeyDown={(trip.driver as { id?: number }).id && onOpenProfile ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAvatarClick(e);
            }
          } : undefined}
          style={{
            cursor: (trip.driver as { id?: number }).id && onOpenProfile ? 'pointer' : 'default',
            flexShrink: 0,
          }}
          className={(trip.driver as { id?: number }).id && onOpenProfile ? 'focus-ring pressable' : undefined}
        >
          <Avatar label={trip.driver.avatar} rating={trip.driver.rating} size={54} />
        </div>
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
                color: 'var(--foreground)',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
            <RouteDot filled />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.route?.from || `Брагино, ${trip.address}`}
            </span>
          </div>
          <RouteMidConnector />
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
            <RouteDot />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.route?.to || 'Центр, пл. Волкова'}
            </span>
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
          Выезд&nbsp;&nbsp;<b style={{ color: 'var(--foreground)', fontWeight: 700 }}>{weekday ? `${weekday}, ` : ''}{trip.time}</b>
          <br />
          {trip.car && (
            <>
              Машина&nbsp;&nbsp;<b style={{ color: 'var(--foreground)', fontWeight: 700 }}>{trip.car}{trip.carColor ? `, ${trip.carColor}` : ''}</b>
              <br />
            </>
          )}
          {(trip.plate || trip.plateLocked) && (
            <>
              Номер&nbsp;&nbsp;
              {trip.plate ? (
                <span style={plateBadgeStyle}>{trip.plate}</span>
              ) : (
                <>
                  <CensoredPlate />
                  <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>
                    &nbsp;&nbsp;откроется после бронирования
                  </span>
                </>
              )}
              <br />
            </>
          )}
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
        {trip.isOwn ? (
          // Прошедшую/завершённую поездку отменять нельзя — действие скрыто.
          isPast ? null : confirmingCancel ? (
            <>
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center', lineHeight: 1.5 }}>
                Отменить поездку? Все брони будут сняты, пассажиры получат уведомление.
              </div>
              <Button
                variant="primary"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                style={{ background: 'var(--destructive)', color: '#ffffff' }}
              >
                {cancelling ? 'Отменяем…' : 'Да, отменить поездку'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingCancel(false)} disabled={cancelling} style={{ minHeight: '44px' }}>
                Не отменять
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmingCancel(true)}
              style={{ minHeight: '48px', color: 'var(--destructive)', fontWeight: 700 }}
            >
              Отменить поездку
            </Button>
          )
        ) : (
          <>
            <Button variant="primary" onClick={handleBook}>
              Забронировать место
            </Button>
            <Button variant="ghost" icon="i-share" style={{ minHeight: '44px' }}>
              Поделиться поездкой
            </Button>
          </>
        )}
        </div>
      </Appear>
    </div>
  );
};

export default TripDetailsScreen;
