import { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Topbar from '../components/Topbar';
import Hero from '../components/Hero';
import TripCard from '../components/TripCard';
import TripCardSkeleton from '../components/TripCardSkeleton';
import EmptyTripsState from '../components/EmptyTripsState';
import ErrorTripsState from '../components/ErrorTripsState';
import { Appear, AppearList } from '../components/Appear';
import type { Trip } from '../types/navigation';
import type { UserRole } from '../lib/role';
import { formatSubtitle } from '../lib/date';

interface MainScreenProps {
  trips: Trip[];
  onTripClick: (trip: Trip) => void;
  onPublish: () => void;
  onLeaveRequest?: () => void;
  subtitle?: string;
  title?: string;
  heroKicker?: string;
  loading?: boolean;
  error?: Error;
  onRetry?: () => void;
  onToggleDirection?: () => void;
  userRole?: UserRole;
}

const MainScreen: React.FC<MainScreenProps> = ({
  trips,
  onTripClick,
  onPublish,
  onLeaveRequest,
  subtitle = formatSubtitle('утро 7:30–8:40'),
  title = 'Брагино → Центр',
  heroKicker = 'Сегодня по маршруту',
  loading = false,
  error,
  onRetry,
  onToggleDirection,
  userRole = 'passenger',
}) => {
  const firstTripRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openFirstTripDetails = () => {
    if (trips.length > 0) {
      onTripClick(trips[0]);
    }
  };

  const hasTrips = trips.length > 0;

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
      <Topbar
        title={title}
        subtitle={subtitle}
      />
      <AnimatePresence mode="wait">
        {loading ? (
          <Appear key="loading-skeleton" instant>
            <TripCardSkeleton count={2} />
          </Appear>
        ) : error ? (
          <Appear key="error-state" animateKey="error-state">
            <ErrorTripsState error={error} onRetry={onRetry ?? (() => {})} />
          </Appear>
        ) : (
          <Appear
            key={hasTrips ? 'trips-content' : 'empty-content'}
            animateKey={hasTrips ? `trips-${trips.length}` : 'empty-state'}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <>
              <Hero
                subtitle={heroKicker}
                title={hasTrips ? `${trips.length} ${trips.length === 1 ? 'поездка' : trips.length < 5 ? 'поездки' : 'поездок'} в твою сторону` : 'поездок нет'}
                ctaText={hasTrips ? `Ближайшая в ${trips[0].time}` : undefined}
                onCtaClick={hasTrips ? openFirstTripDetails : undefined}
                onToggleDirection={onToggleDirection}
                onPublish={onPublish}
                showPublish={userRole === 'driver'}
              />
              {hasTrips ? (
                <AppearList stagger={40} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {trips.map((trip, index) => (
                    <TripCard
                      key={trip.id}
                      {...trip}
                      ref={index === 0 ? firstTripRef : null}
                      expanded={expandedId === trip.id}
                      onToggle={() => setExpandedId((prev) => (prev === trip.id ? null : trip.id))}
                      onBook={() => onTripClick(trip)}
                    />
                  ))}
                </AppearList>
              ) : (
                <EmptyTripsState
                  onLeaveRequest={onLeaveRequest}
                />
              )}
            </>
          </Appear>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MainScreen;
