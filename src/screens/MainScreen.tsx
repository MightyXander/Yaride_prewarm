import { useRef, useState } from 'react';
import Topbar from '../components/Topbar';
import Hero from '../components/Hero';
import TripCard from '../components/TripCard';
import Button from '../components/ui/Button';
import type { Trip } from '../types/navigation';

interface MainScreenProps {
  trips: Trip[];
  onTripClick: (trip: Trip) => void;
  onEmptyState: () => void;
  onPublish: () => void;
  subtitle?: string;
  title?: string;
  heroKicker?: string;
}

const MainScreen: React.FC<MainScreenProps> = ({
  trips,
  onTripClick,
  onEmptyState,
  onPublish,
  subtitle = 'среда, утро 7:30–8:40',
  title = 'Брагино → Центр',
  heroKicker = 'Сегодня по маршруту',
}) => {
  const firstTripRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const scrollToFirstTrip = () => {
    if (firstTripRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      firstTripRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
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
      <Topbar title={title} subtitle={subtitle} />
      {hasTrips ? (
        <>
          <Hero
            subtitle={heroKicker}
            title={
              <>
                {trips.length} {trips.length === 1 ? 'поездка' : trips.length < 5 ? 'поездки' : 'поездок'}
                <br />в твою сторону
              </>
            }
            ctaText={`Ближайшая в ${trips[0].time}`}
            onCtaClick={scrollToFirstTrip}
          />
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
              marginTop: 'auto',
              paddingTop: '6px',
            }}
          >
            <Button variant="primary" icon="i-car" onClick={onPublish}>
              Возьму попутчиков
            </Button>
            <Button variant="secondary" icon="i-search" onClick={onEmptyState}>
              Ищу, кто подвезёт
            </Button>
          </div>
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '20px',
          }}
        >
          <Button variant="primary" onClick={onEmptyState}>
            Посмотреть пустой результат
          </Button>
        </div>
      )}
    </div>
  );
};

export default MainScreen;
