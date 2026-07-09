import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Topbar from '../components/Topbar';
import Hero from '../components/Hero';
import TripCard from '../components/TripCard';
import TripCardSkeleton from '../components/TripCardSkeleton';
import HeroSkeleton from '../components/HeroSkeleton';
import EmptyTripsState from '../components/EmptyTripsState';
import ErrorTripsState from '../components/ErrorTripsState';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { AppearList } from '../components/Appear';
import { useResponsiveCardGridStyle } from '../components/ui/ResponsiveCardGrid';
import type { Trip } from '../types/navigation';
import type { UserRole } from '../lib/role';
import { formatSubtitle } from '../lib/date';
import { useProfile } from '../contexts/ProfileContext';

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
  onOpenProfile?: (userId: number) => void;
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
  onOpenProfile,
}) => {
  const firstTripRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const prefersReduced = useReducedMotion();
  const { profile } = useProfile();
  // Десктоп (issue #367): список поездок — адаптивная сетка (несколько колонок),
  // на мобиле/Telegram — прежняя одна колонка. Переиспользуемый паттерн см.
  // src/components/ui/ResponsiveCardGrid.tsx.
  const tripGridStyle = useResponsiveCardGridStyle();

  // Кнопку «Создать поездку» показываем водителю. Источник истины — серверный
  // статус ВУ (license_status==='verified'), а не только localStorage-роль:
  // в Telegram WebView роль между запусками может теряться, и верифицированный
  // водитель оставался без кнопки публикации (в т.ч. сразу после создания поездки).
  const canPublish = userRole === 'driver' || profile?.license_status === 'verified';

  const openFirstTripDetails = () => {
    if (trips.length > 0) {
      onTripClick(trips[0]);
    }
  };

  const hasTrips = trips.length > 0;

  const D = prefersReduced ? 0 : 0.42;
  const DX = prefersReduced ? 0 : 0.3;
  const EASE = [0.22, 1, 0.36, 1] as const;
  // При reduced-motion держим opacity на 1: иначе мгновенные переходы 0↔1
  // (skeleton → контент при загрузке) дают видимое мигание экрана.
  const fadeOpacity = prefersReduced ? 1 : 0;

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        // Нижний клиренс под FloatingNav: последняя карточка/кнопка «Забронировать»
        // должна доскролливаться выше навбара, а не оставаться под ним.
        padding: `6px 16px ${FLOATING_NAV_SCROLL_CLEARANCE}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Topbar title={title} subtitle={subtitle} />

      <div style={{ position: 'relative' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {loading ? (
            <motion.div
              key="loading-skeleton"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
              transition={{ duration: DX, ease: EASE }}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <HeroSkeleton />
              <TripCardSkeleton count={3} />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error-state"
              initial={{ opacity: fadeOpacity }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
              transition={{ duration: D, ease: EASE }}
            >
              <ErrorTripsState error={error} onRetry={onRetry ?? (() => {})} />
            </motion.div>
          ) : hasTrips ? (
            <motion.div
              key="trips-content"
              initial={{ opacity: fadeOpacity }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
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
                showPublish={canPublish}
              />
              <AppearList stagger={40} style={{ flexShrink: 0, ...tripGridStyle }}>
                {trips.map((trip, index) => (
                  <TripCard
                    key={trip.id}
                    {...trip}
                    ref={index === 0 ? firstTripRef : null}
                    isNext={index === 0}
                    expanded={expandedId === trip.id}
                    onToggle={() => setExpandedId((prev) => (prev === trip.id ? null : trip.id))}
                    onBook={() => onTripClick(trip)}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </AppearList>
            </motion.div>
          ) : (
            <motion.div
              key="empty-state"
              initial={{ opacity: fadeOpacity }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
              transition={{ duration: D, ease: EASE }}
            >
              {/* Без Hero: по эталону в пустом состоянии показываем только карточку «Поездок пока нет». */}
              <EmptyTripsState
                onLeaveRequest={onLeaveRequest}
                onPublish={onPublish}
                showPublish={canPublish}
                onToggleDirection={onToggleDirection}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MainScreen;
