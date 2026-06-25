import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { hapticSelection, hapticImpact } from '../lib/haptics';

// Экран 17 SPEC: Мои поездки
// Список поездок (имя/время/маршрут, предстоящие/прошлые).
// Сегменты: Предстоящие / Прошлые. Тап по прошлой → оценка (экран 11).

type TripCardData = {
  id: string;
  name: string;
  role: 'пассажир' | 'водитель';
  status: 'бронь' | 'ожидает';
  time: string;
  routeFrom: string;
  routeTo: string;
};

const UPCOMING_TRIPS: TripCardData[] = [
  {
    id: '1',
    name: 'Андрей К.',
    role: 'пассажир',
    status: 'бронь',
    time: 'Завтра, 7:40',
    routeFrom: 'Брагино, ул. Урицкого, 12',
    routeTo: 'Центр, пл. Волкова',
  },
  {
    id: '2',
    name: 'Моя поездка',
    role: 'водитель',
    status: 'ожидает',
    time: 'Сегодня, 17:40',
    routeFrom: 'Центр, пл. Волкова',
    routeTo: 'Брагино, ул. Урицкого, 12',
  },
];

const PAST_TRIPS: TripCardData[] = [
  {
    id: '3',
    name: 'Марина С.',
    role: 'пассажир',
    status: 'бронь',
    time: 'Вчера, 7:55',
    routeFrom: 'Брагино, пр-т Дзержинского, 8',
    routeTo: 'Центр, пл. Волкова',
  },
];

interface MyTripsScreenProps {
  onCreateTrip?: () => void;
  onRateTrip?: (tripId: string) => void;
}

const MyTripsScreen: React.FC<MyTripsScreenProps> = ({ onCreateTrip, onRateTrip }) => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const trips = activeTab === 'upcoming' ? UPCOMING_TRIPS : PAST_TRIPS;

  const handleTabChange = (tab: 'upcoming' | 'past') => {
    setActiveTab(tab);
    hapticSelection();
  };

  const handleTripClick = (trip: TripCardData) => {
    // Прошлые поездки → оценка (экран 11)
    if (activeTab === 'past') {
      hapticImpact('light');
      onRateTrip?.(trip.id);
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
      <Header title="Мои поездки" />

      {/* Сегментированный контрол: Предстоящие / Прошлые */}
      <div
        style={{
          display: 'flex',
          background: 'var(--secondary)',
          borderRadius: '15px',
          padding: '4px',
          gap: '4px',
        }}
      >
        <button
          type="button"
          onClick={() => handleTabChange('upcoming')}
          style={{
            flex: 1,
            height: '36px',
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '13px',
            fontWeight: 700,
            color: activeTab === 'upcoming' ? 'var(--foreground)' : 'var(--muted-foreground)',
            background: activeTab === 'upcoming' ? 'var(--card)' : 'transparent',
            boxShadow: activeTab === 'upcoming' ? 'var(--shadow-card)' : 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          Предстоящие
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('past')}
          style={{
            flex: 1,
            height: '36px',
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '13px',
            fontWeight: 700,
            color: activeTab === 'past' ? 'var(--foreground)' : 'var(--muted-foreground)',
            background: activeTab === 'past' ? 'var(--card)' : 'transparent',
            boxShadow: activeTab === 'past' ? 'var(--shadow-card)' : 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          Прошлые
        </button>
      </div>

      {/* Список поездок */}
      {trips.map((trip) => (
        <Card
          key={trip.id}
          role={activeTab === 'past' ? 'button' : undefined}
          tabIndex={activeTab === 'past' ? 0 : undefined}
          className={activeTab === 'past' ? 'focus-ring pressable' : undefined}
          onClick={() => handleTripClick(trip)}
          onKeyDown={
            activeTab === 'past'
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTripClick(trip);
                  }
                }
              : undefined
          }
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
            cursor: activeTab === 'past' ? 'pointer' : 'default',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              margin: 0,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
              {trip.name}{' '}
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '12px' }}>
                · {trip.role}
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color:
                  trip.status === 'бронь' ? 'var(--success-foreground)' : 'var(--foreground)',
                background:
                  trip.status === 'бронь'
                    ? 'var(--success)'
                    : 'var(--accent)',
                padding: '3px 10px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
                boxShadow:
                  trip.status === 'ожидает'
                    ? 'inset 0 0 0 1px rgba(255, 221, 45, .35)'
                    : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {trip.status === 'бронь' && (
                <Icon id="i-check" style={{ width: '12px', height: '12px' }} />
              )}
              {trip.status}
            </span>
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: '16px',
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {trip.time}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
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
              <div
                style={{
                  width: '11px',
                  height: '11px',
                  borderRadius: '999px',
                  border: '2px solid var(--brand)',
                  background: 'var(--brand)',
                  flexShrink: 0,
                }}
              />
              {trip.routeFrom}
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
              <div
                style={{
                  width: '11px',
                  height: '11px',
                  borderRadius: '999px',
                  border: '2px solid var(--brand)',
                  background: activeTab === 'upcoming' ? 'transparent' : 'var(--brand)',
                  flexShrink: 0,
                }}
              />
              {trip.routeTo}
            </div>
          </div>
        </Card>
      ))}

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
          icon="i-plus"
          onClick={() => {
            hapticImpact('light');
            onCreateTrip?.();
          }}
        >
          Создать поездку
        </Button>
      </div>
    </div>
  );
};

export default MyTripsScreen;
