import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { hapticSelection, hapticImpact } from '../lib/haptics';
import { getMyTrips, ApiException } from '../lib/api';
import type { UserTripItem } from '../types/api';

// Демо-данные для браузера без Telegram (graceful fallback при 401).
const DEMO_UPCOMING: UserTripItem[] = [
  {
    trip_id: 1,
    role: 'passenger',
    trip_date: '2026-06-27',
    departure_time: '07:40:00',
    time_slot: 'morning',
    start_title: 'Брагино, ул. Урицкого, 12',
    end_title: 'Центр, пл. Волкова',
    price_rub: 100,
    seats_total: 3,
    seats_booked: 1,
    trip_status: 'open',
    booking_id: 10,
    booking_status: 'active',
    passenger_seats: 1,
  },
  {
    trip_id: 2,
    role: 'driver',
    trip_date: '2026-06-26',
    departure_time: '17:40:00',
    time_slot: 'evening',
    start_title: 'Центр, пл. Волкова',
    end_title: 'Брагино, ул. Урицкого, 12',
    price_rub: 150,
    seats_total: 3,
    seats_booked: 0,
    trip_status: 'open',
    booking_id: null,
    booking_status: null,
    passenger_seats: null,
  },
];

const DEMO_PAST: UserTripItem[] = [
  {
    trip_id: 3,
    role: 'passenger',
    trip_date: '2026-06-25',
    departure_time: '07:55:00',
    time_slot: 'morning',
    start_title: 'Брагино, пр-т Дзержинского, 8',
    end_title: 'Центр, пл. Волкова',
    price_rub: 100,
    seats_total: 3,
    seats_booked: 2,
    trip_status: 'completed',
    booking_id: 9,
    booking_status: 'active',
    passenger_seats: 1,
  },
];

interface MyTripsScreenProps {
  onCreateTrip?: () => void;
  onRateTrip?: (tripId: string) => void;
}

const MyTripsScreen: React.FC<MyTripsScreenProps> = ({ onCreateTrip, onRateTrip }) => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [upcomingTrips, setUpcomingTrips] = useState<UserTripItem[]>([]);
  const [pastTrips, setPastTrips] = useState<UserTripItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadTrips = async () => {
      setLoading(true);
      try {
        const [upcomingRes, pastRes] = await Promise.all([
          getMyTrips({ status: 'upcoming' }),
          getMyTrips({ status: 'past' }),
        ]);
        if (mounted) {
          setUpcomingTrips(upcomingRes.trips);
          setPastTrips(pastRes.trips);
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof ApiException && err.status === 401) {
          if (mounted) {
            setUpcomingTrips(DEMO_UPCOMING);
            setPastTrips(DEMO_PAST);
            setLoading(false);
          }
        } else {
          if (mounted) {
            setUpcomingTrips(DEMO_UPCOMING);
            setPastTrips(DEMO_PAST);
            setLoading(false);
          }
        }
      }
    };

    loadTrips();
    return () => { mounted = false; };
  }, []);

  const trips = activeTab === 'upcoming' ? upcomingTrips : pastTrips;

  const handleTabChange = (tab: 'upcoming' | 'past') => {
    setActiveTab(tab);
    hapticSelection();
  };

  const handleTripClick = (trip: UserTripItem) => {
    if (activeTab === 'past') {
      hapticImpact('light');
      onRateTrip?.(trip.trip_id.toString());
    }
  };

  const formatTime = (tripDate: string, departureTime: string): string => {
    const date = new Date(`${tripDate}T${departureTime}`);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    if (date.toDateString() === today.toDateString()) {
      return `Сегодня, ${timeStr}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Завтра, ${timeStr}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Вчера, ${timeStr}`;
    } else {
      return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${timeStr}`;
    }
  };

  const getRoleLabel = (role: 'driver' | 'passenger'): 'водитель' | 'пассажир' => {
    return role === 'driver' ? 'водитель' : 'пассажир';
  };

  const getStatusLabel = (trip: UserTripItem): 'бронь' | 'ожидает' | 'завершено' => {
    if (trip.trip_status === 'completed') return 'завершено';
    if (trip.booking_status === 'active') return 'бронь';
    return 'ожидает';
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

      {loading ? (
        <>
          {[1, 2].map((i) => (
            <Card key={i} style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '140px' }}>
              <div
                style={{
                  height: '16px',
                  width: '50%',
                  borderRadius: '8px',
                  background: 'var(--secondary)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: '20px',
                  width: '70%',
                  borderRadius: '10px',
                  background: 'var(--secondary)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: '14px',
                  width: '90%',
                  borderRadius: '7px',
                  background: 'var(--secondary)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: '14px',
                  width: '90%',
                  borderRadius: '7px',
                  background: 'var(--secondary)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            </Card>
          ))}
        </>
      ) : trips.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '32px 16px' }}>
          <Icon
            id="i-receipt"
            style={{
              width: '48px',
              height: '48px',
              color: 'var(--muted-foreground)',
              margin: '0 auto 12px',
              display: 'block',
            }}
          />
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--muted-foreground)' }}>
            {activeTab === 'upcoming' ? 'Нет предстоящих поездок' : 'Нет прошлых поездок'}
          </div>
        </Card>
      ) : (
        trips.map((trip) => {
          const status = getStatusLabel(trip);
          const name = trip.role === 'driver' ? 'Моя поездка' : 'Поездка';

          return (
            <Card
              key={trip.trip_id}
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
                  {name}{' '}
                  <span style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '12px' }}>
                    · {getRoleLabel(trip.role)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color:
                      status === 'бронь' ? 'var(--success-foreground)' : status === 'завершено' ? 'var(--muted-foreground)' : 'var(--foreground)',
                    background:
                      status === 'бронь'
                        ? 'var(--success)'
                        : status === 'завершено'
                          ? 'var(--secondary)'
                          : 'var(--accent)',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                    boxShadow:
                      status === 'ожидает'
                        ? 'inset 0 0 0 1px rgba(255, 221, 45, .35)'
                        : 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {status === 'бронь' && (
                    <Icon id="i-check" style={{ width: '12px', height: '12px' }} />
                  )}
                  {status}
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
                {formatTime(trip.trip_date, trip.departure_time)}
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
                  {trip.start_title}
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
                  {trip.end_title}
                </div>
              </div>
            </Card>
          );
        })
      )}

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
