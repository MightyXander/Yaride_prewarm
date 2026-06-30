import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { RouteDot, RouteMidConnector } from '../components/ui/RouteConnector';
import { LoadErrorState, EmptyState } from '../components/ui/StateView';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { Skeleton } from '../components/ui/Skeleton';
import { hapticSelection, hapticImpact } from '../lib/haptics';
import { getMyTrips, ApiException } from '../lib/api';
import type { UserTripItem } from '../types/api';
import { Appear, AppearList } from '../components/Appear';

// Демо-данные для браузера без Telegram (graceful fallback при 401).
// Даты относительно сегодня: upcoming = сегодня/завтра, past = вчера/позавчера.
const getDemoData = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(today.getDate() - 2);

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const upcomingTrips: UserTripItem[] = [
    {
      trip_id: 1,
      role: 'passenger',
      trip_date: formatDate(today),
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
      driver_id: 5,
    },
    {
      trip_id: 2,
      role: 'driver',
      trip_date: formatDate(tomorrow),
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
      driver_id: null,
    },
  ];

  const pastTrips: UserTripItem[] = [
    {
      trip_id: 3,
      role: 'passenger',
      trip_date: formatDate(yesterday),
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
      driver_id: 7,
    },
  ];

  return { upcomingTrips, pastTrips };
};

interface MyTripsScreenProps {
  onCreateTrip?: () => void;
  /** Открыть детали поездки по клику на карточку. */
  onOpenTrip?: (tripId: number) => void;
  onRateTrip?: (tripId: number, rateeId: number, raterRole: 'driver' | 'passenger') => void;
}

const MyTripsScreen: React.FC<MyTripsScreenProps> = ({ onCreateTrip, onOpenTrip, onRateTrip }) => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [upcomingTrips, setUpcomingTrips] = useState<UserTripItem[]>([]);
  const [pastTrips, setPastTrips] = useState<UserTripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [upcomingRes, pastRes] = await Promise.all([
        getMyTrips({ status: 'upcoming' }),
        getMyTrips({ status: 'past' }),
      ]);
      setUpcomingTrips(upcomingRes.trips);
      setPastTrips(pastRes.trips);
    } catch (err) {
      // 401 (браузер без Telegram) — graceful демо-фолбэк; иначе — состояние ошибки.
      if (err instanceof ApiException && err.status === 401) {
        const { upcomingTrips: demoUp, pastTrips: demoPast } = getDemoData();
        setUpcomingTrips(demoUp);
        setPastTrips(demoPast);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const trips = activeTab === 'upcoming' ? upcomingTrips : pastTrips;

  const handleTabChange = (tab: 'upcoming' | 'past') => {
    setActiveTab(tab);
    hapticSelection();
  };

  const handleTripClick = (trip: UserTripItem) => {
    hapticImpact('light');
    onOpenTrip?.(trip.trip_id);
  };

  // Оценка прошлой поездки — отдельной кнопкой (stopPropagation, чтобы не открыть детали).
  const handleRateClick = (e: React.MouseEvent | React.KeyboardEvent, trip: UserTripItem) => {
    e.stopPropagation();
    if (trip.driver_id !== null) {
      hapticImpact('light');
      onRateTrip?.(trip.trip_id, trip.driver_id, trip.role);
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

  // Поездка уже состоялась, если её дата+время выезда в прошлом.
  const isTripPast = (trip: UserTripItem): boolean => {
    const departed = new Date(`${trip.trip_date}T${trip.departure_time}`);
    return departed.getTime() < Date.now();
  };

  const getStatusLabel = (trip: UserTripItem): 'бронь' | 'ожидает' | 'завершено' => {
    if (trip.trip_status === 'completed') return 'завершено';
    if (trip.booking_status === 'active') return 'бронь';
    // Прошедшие поездки (status=open, дата в прошлом) не «ожидают» — показываем «завершено».
    if (isTripPast(trip)) return 'завершено';
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
            height: '44px',
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '15px',
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
            height: '44px',
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '15px',
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

      <AnimatePresence mode="wait">
        {loading ? (
          <Appear key="loading-skeleton" instant>
            <>
              {[1, 2].map((i) => (
                <Card key={i} style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '140px', marginBottom: '12px' }}>
                  <Skeleton h={16} w="50%" r={8} />
                  <Skeleton h={20} w="70%" r={10} />
                  <Skeleton h={14} w="90%" r={7} />
                  <Skeleton h={14} w="90%" r={7} />
                </Card>
              ))}
            </>
          </Appear>
        ) : error ? (
          <Appear key="error" animateKey="error">
            <LoadErrorState onRetry={() => { void loadTrips(); }} />
          </Appear>
        ) : trips.length === 0 ? (
          <Appear key={`empty-${activeTab}`} animateKey={`empty-${activeTab}`}>
            <EmptyState
              icon={
                <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
                  <path d="M4 3h16v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L4 21z" />
                  <path d="M8 8h8M8 12h8M8 16h4" />
                </svg>
              }
              title={activeTab === 'upcoming' ? 'Нет предстоящих поездок' : 'Нет прошлых поездок'}
              subtitle={activeTab === 'upcoming'
                ? 'Забронируй поездку или создай свою — она появится здесь.'
                : 'Завершённые поездки появятся здесь.'}
            />
          </Appear>
        ) : (
          <AppearList key={`trips-${activeTab}`} animateKey={`trips-${activeTab}`} stagger={40} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {trips.map((trip) => {
              const status = getStatusLabel(trip);
              const name = trip.role === 'driver' ? 'Моя поездка' : 'Поездка';
              const canRate = activeTab === 'past' && trip.driver_id !== null;

              return (
                <Card
                  key={trip.trip_id}
                  role="button"
                  tabIndex={0}
                  className="focus-ring pressable"
                  aria-label={`Открыть детали поездки: ${trip.start_title} — ${trip.end_title}`}
                  onClick={() => handleTripClick(trip)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTripClick(trip);
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '9px',
                    cursor: 'pointer',
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
                        fontSize: '12px',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
                      <RouteDot filled />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trip.start_title}
                      </span>
                    </div>
                    <RouteMidConnector />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
                      <RouteDot />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trip.end_title}
                      </span>
                    </div>
                  </div>
                  {canRate && (
                    <button
                      type="button"
                      onClick={(e) => handleRateClick(e, trip)}
                      onKeyDown={(e) => {
                        // Не давать Enter/Space всплыть до карточки (иначе откроются и детали)
                        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                      }}
                      className="focus-ring pressable"
                      style={{
                        marginTop: '3px',
                        minHeight: '40px',
                        padding: '0 16px',
                        borderRadius: '14px',
                        border: '1px solid var(--field-border)',
                        background: 'var(--field)',
                        boxShadow: 'var(--field-shadow)',
                        color: 'var(--foreground)',
                        fontWeight: 700,
                        fontSize: '14px',
                        fontFamily: 'var(--font-sans)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px',
                      }}
                    >
                      <Icon id="i-star" style={{ width: '15px', height: '15px' }} />
                      Оценить поездку
                    </button>
                  )}
                </Card>
              );
            })}
          </AppearList>
        )}
      </AnimatePresence>

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
