import { useRef, useState } from 'react';
import Topbar from '../components/Topbar';
import Hero from '../components/Hero';
import TripCard from '../components/TripCard';
import TripCardSkeleton from '../components/TripCardSkeleton';
import EmptyTripsState from '../components/EmptyTripsState';
import ErrorTripsState from '../components/ErrorTripsState';
import type { Trip } from '../types/navigation';

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
        onPublish={showPublishInTopbar ? onPublish : undefined}
      />
      {loading ? (
        <TripCardSkeleton count={2} />
      ) : error ? (
        <ErrorTripsState error={error} onRetry={onRetry ?? (() => {})} />
      ) : hasTrips ? (
        <>
          <Hero
            subtitle={heroKicker}
            title={`${trips.length} ${trips.length === 1 ? 'поездка' : trips.length < 5 ? 'поездки' : 'поездок'} в твою сторону`}
            ctaText={`Ближайшая в ${trips[0].time}`}
            onCtaClick={openFirstTripDetails}
          />
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          </div>
        </>
      ) : (
        <EmptyTripsState
          timeWindow={subtitle.includes('утро') ? 'утро' : 'вечер'}
          onLeaveRequest={onLeaveRequest}
        />
      )}
    </div>
  );
};

export default MainScreen;
