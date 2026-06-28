import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Topbar from '../components/Topbar';
import Hero from '../components/Hero';
import TripCard from '../components/TripCard';
import TripCardSkeleton from '../components/TripCardSkeleton';
import HeroSkeleton from '../components/HeroSkeleton';
import EmptyTripsState from '../components/EmptyTripsState';
import ErrorTripsState from '../components/ErrorTripsState';
import { AppearList } from '../components/Appear';
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
  const prefersReduced = useReducedMotion();

  const openFirstTripDetails = () => {
    if (trips.length > 0) {
      onTripClick(trips[0]);
    }
  };

  const hasTrips = trips.length > 0;

  // Длительности: «суперплавно», но reduced-motion → мгновенно.
  const D = prefersReduced ? 0 : 0.42; // появление данных
  const DX = prefersReduced ? 0 : 0.3; // уход скелетона
  const EASE = [0.22, 1, 0.36, 1] as const;

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
      <Topbar title={title} subtitle={subtitle} />

      {/* position:relative — чтобы уходящий скелетон (popLayout → absolute)
          лёг ровно поверх входящего контента и они кроссфейднулись «на месте».
          mode="popLayout" убирает паузу mode="wait" (мигание пустотой). */}
      <div style={{ position: 'relative' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {loading ? (
            <motion.div
              key="loading-skeleton"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DX, ease: EASE }}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {/* Структурный двойник реального экрана: Hero + карточки в той же
                  геометрии. Поэтому при готовности ничего не «прыгает». */}
              <HeroSkeleton />
              <TripCardSkeleton count={3} />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: D, ease: EASE }}
            >
              <ErrorTripsState error={error} onRetry={onRetry ?? (() => {})} />
            </motion.div>
          ) : hasTrips ? (
            <motion.div
              key="trips-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: D, ease: EASE }}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <Hero
                subtitle={heroKicker}
                title={`${trips.length} ${trips.length === 1 ? 'поездка' : trips.length < 5 ? 'поездки' : 'поездок'} в твою сторону`}
                ctaText={`Ближайшая в ${trips[0].time}`}
                onCtaClick={openFirstTripDetails}
                onToggleDirection={onToggleDirection}
                onPublish={onPublish}
                showPublish={userRole === 'driver'}
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
            </motion.div>
          ) : (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: D, ease: EASE }}
            >
              <EmptyTripsState
                timeWindow={subtitle.includes('утро') ? 'утро' : 'вечер'}
                onLeaveRequest={onLeaveRequest}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MainScreen;
