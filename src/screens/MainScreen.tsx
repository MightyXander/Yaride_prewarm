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
  showPublishInTopbar?: boolean;
  userRole?: UserRole;
}

const MainScreen: React.FC<MainScreenProps> = ({
  trips,
  onTripClick,
  onPublish,
  onLeaveRequest,
  subtitle = 'среда, утро 7:30–8:40',
  title = 'Брагино → Центр',
  heroKicker = 'Сегодня по маршруту',
  loading = false,
  error,
  onRetry,
  onToggleDirection,
  showPublishInTopbar = true,
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
        onToggleDirection={onToggleDirection}
        onPublish={showPublishInTopbar && userRole === 'driver' ? onPublish : undefined}
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
        ) : hasTrips ? (
          <Appear key="trips-content" animateKey={`trips-${trips.length}`}>
            <>
              <Hero
                subtitle={heroKicker}
                title={`${trips.length} ${trips.length === 1 ? 'поездка' : trips.length < 5 ? 'поездки' : 'поездок'} в твою сторону`}
                ctaText={`Ближайшая в ${trips[0].time}`}
                onCtaClick={openFirstTripDetails}
              />
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
            </>
          </Appear>
        ) : (
          <Appear key="empty-state" animateKey="empty-state">
            <EmptyTripsState
              timeWindow={subtitle.includes('утро') ? 'утро' : 'вечер'}
              onLeaveRequest={onLeaveRequest}
            />
          </Appear>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MainScreen;
