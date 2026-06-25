import { useState, useEffect } from 'react';
import { Icons } from './components/Icons';
import BackButton from './components/BackButton';
import IntroScreen from './screens/IntroScreen';
import MainScreen from './screens/MainScreen';
import TripDetailsScreen from './screens/TripDetailsScreen';
import EmptyStateScreen from './screens/EmptyStateScreen';
import BookingProfileScreen from './screens/BookingProfileScreen';
import DriverPublishScreen from './screens/DriverPublishScreen';
import BookingConfirmedScreen from './screens/BookingConfirmedScreen';
import { useNavigation } from './hooks/useNavigation';
import type { Trip } from './types/navigation';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (window.Telegram?.WebApp) {
      return window.Telegram.WebApp.colorScheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const { currentScreen, selectedTrip, confirmKind, navigate, goBack } = useNavigation('intro');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setTheme(tg.colorScheme);

      const handleThemeChange = () => {
        setTheme(tg.colorScheme);
      };
      tg.onEvent('themeChanged', handleThemeChange);

      return () => {
        tg.offEvent('themeChanged', handleThemeChange);
      };
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const trips: Trip[] = [
    {
      id: '1',
      driver: {
        name: 'Андрей К.',
        rating: 4.9,
        tripCount: 37,
        avatar: 'А',
        age: 34,
        verified: true,
        memberSince: 'мая 2026',
      },
      address: 'ул. Урицкого, 12',
      car: 'Kia Rio',
      price: '80',
      time: '7:40',
      seats: 2,
      route: {
        from: 'Брагино, ул. Урицкого, 12',
        to: 'Центр, пл. Волкова',
        duration: '22 мин',
      },
    },
    {
      id: '2',
      driver: {
        name: 'Марина С.',
        rating: 5.0,
        tripCount: 12,
        avatar: 'М',
        age: 29,
        verified: true,
        memberSince: 'января 2026',
      },
      address: 'пр-т Дзержинского, 8',
      car: 'VW Polo',
      price: '70',
      time: '7:55',
      seats: 3,
      route: {
        from: 'Брагино, пр-т Дзержинского, 8',
        to: 'Центр, пл. Волкова',
        duration: '25 мин',
      },
    },
  ];

  // Экран 8 «Главный — другие поездки»: тот же главный, но с бóльшим списком рыба-trips
  const tripsMore: Trip[] = [
    ...trips,
    {
      id: '3',
      driver: {
        name: 'Игорь П.',
        rating: 4.7,
        tripCount: 54,
        avatar: 'И',
        age: 41,
        verified: true,
        memberSince: 'марта 2026',
      },
      address: 'ул. Свободы, 60',
      car: 'Skoda Octavia',
      price: '90',
      time: '8:10',
      seats: 1,
      route: {
        from: 'Брагино, ул. Свободы, 60',
        to: 'Центр, пл. Волкова',
        duration: '24 мин',
      },
    },
  ];

  const showBackButton = currentScreen !== 'intro';

  return (
    <div className={theme}>
      <Icons />
      <BackButton onClick={goBack} show={showBackButton} />
      <div
        style={{
          maxWidth: '390px',
          margin: '0 auto',
          background: 'var(--background)',
          color: 'var(--foreground)',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {currentScreen === 'intro' && <IntroScreen onContinue={() => navigate('main')} />}
        {currentScreen === 'main' && (
          <MainScreen
            trips={trips}
            onTripClick={(trip) => navigate('trip-details', trip)}
            onEmptyState={() => navigate('empty-state')}
            onPublish={() => navigate('driver-publish')}
          />
        )}
        {currentScreen === 'main-more' && (
          <MainScreen
            trips={tripsMore}
            subtitle="среда, утро 7:30–8:40 · обновлено"
            onTripClick={(trip) => navigate('trip-details', trip)}
            onEmptyState={() => navigate('empty-state')}
            onPublish={() => navigate('driver-publish')}
          />
        )}
        {currentScreen === 'trip-details' && selectedTrip && (
          <TripDetailsScreen trip={selectedTrip} onBook={() => navigate('booking-profile')} />
        )}
        {currentScreen === 'empty-state' && <EmptyStateScreen />}
        {currentScreen === 'booking-profile' && selectedTrip && (
          <BookingProfileScreen
            trip={selectedTrip}
            onConfirm={() => navigate('booking-confirmed', null, 'booking')}
          />
        )}
        {currentScreen === 'driver-publish' && (
          <DriverPublishScreen onPublish={() => navigate('booking-confirmed', null, 'publish')} />
        )}
        {currentScreen === 'booking-confirmed' && (
          <BookingConfirmedScreen
            kind={confirmKind}
            trip={selectedTrip}
            onDone={() => navigate('main-more')}
          />
        )}
      </div>
    </div>
  );
}

export default App;
