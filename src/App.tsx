import { useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icons } from './components/Icons';
import BackButton from './components/BackButton';
import { ToastHost } from './components/ToastHost';
import Splash from './components/Splash';
import IntroScreen from './screens/IntroScreen';
import MainScreen from './screens/MainScreen';
import TripDetailsScreen from './screens/TripDetailsScreen';
import BookingProfileScreen from './screens/BookingProfileScreen';
import DriverPublishScreen from './screens/DriverPublishScreen';
import BookingConfirmedScreen from './screens/BookingConfirmedScreen';
import ProfileScreen from './screens/ProfileScreen';
import DriverBookingsScreen from './screens/DriverBookingsScreen';
import BecomeDriverScreen from './screens/BecomeDriverScreen';
import LicenseReviewScreen from './screens/LicenseReviewScreen';
import InTripScreen from './screens/InTripScreen';
import SafetyScreen from './screens/SafetyScreen';
import PassengerRequestScreen from './screens/PassengerRequestScreen';
import RequestPublishedScreen from './screens/RequestPublishedScreen';
import MyTripsScreen from './screens/MyTripsScreen';
import RateTripScreen from './screens/RateTripScreen';
import { FloatingNav, FLOATING_NAV_CONTENT_PADDING } from './components/FloatingNav';
import { useNavigation } from './hooks/useNavigation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useAsync } from './hooks/useAsync';
import { useStartParam } from './hooks/useStartParam';
import { getTrips, getRoutePoints } from './lib/api';
import { mapTripListItemToTrip } from './lib/mappers';
import { loadRole, saveRole, type UserRole } from './lib/role';
import { formatSubtitle } from './lib/date';
import { ProfileProvider } from './contexts/ProfileContext';
import type { Screen } from './types/navigation';
import type { BookingResult } from './types/api';

// Направленный слайд + fade при смене экрана. direction: 1 — вперёд, -1 — назад.
const screenVariants = {
  enter: (dir: 1 | -1) => ({ x: dir * 28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir * -28, opacity: 0 }),
  // При prefers-reduced-motion — только лёгкий fade, без сдвига.
  reducedInitial: { x: 0, opacity: 0 },
  reducedExit: { x: 0, opacity: 0 },
};

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Ручной выбор темы (кнопка на главной) имеет приоритет над авто-определением.
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('yaride-theme') : null;
    if (stored === 'light' || stored === 'dark') return stored;
    if (window.Telegram?.WebApp) {
      return window.Telegram.WebApp.colorScheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Переключение темы вручную + запоминание выбора.
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('yaride-theme', next);
      } catch {
        /* localStorage недоступен — просто не запоминаем */
      }
      return next;
    });
  };

  // Роль пользователя: пассажир или водитель (персистится в localStorage)
  const [userRole, setUserRole] = useState<UserRole | null>(() => loadRole());

  // Определяем начальный экран: если роль уже выбрана — сразу main, иначе intro.
  const initialScreen: Screen = userRole ? 'main' : 'intro';

  // Splash-состояние: показываем при старте, скрываем когда данные готовы или прошло время
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashHiding, setSplashHiding] = useState(false);

  const { currentScreen, selectedTrip, confirmKind, ratingContext, publishedTripId, direction, navigate, navigateToRateTrip, goBack } =
    useNavigation(initialScreen);
  const prefersReducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 430px)');

  // Направление поездки на главном экране (morning/evening)
  const [mainDirection, setMainDirection] = useState<'morning' | 'evening'>('morning');

  // Направление для заявки пассажира (передаётся при открытии формы)
  const [requestDirection, setRequestDirection] = useState<'morning' | 'evening'>('morning');

  // Обработка выбора роли на intro-экране
  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role);
    saveRole(role);
    navigate('main');
  };

  // Обработка "Стать водителем" из профиля
  const handleBecomeDriver = () => {
    setUserRole('driver');
    saveRole('driver');
    navigate('become-driver');
  };

  // Deep-link обработка: при старте Mini App с start_param (например, 'trip-123')
  // открываем соответствующий экран вместо intro.
  useStartParam(navigate);

  // Применяем тема-класс к <html> для глобальной доступности CSS-переменных
  // (portaled-элементы ThemeToggle/BackButton/FloatingNav/ToastHost тоже их видят).
  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    // Если пользователь уже выбрал тему вручную — не перетираем её авто-источником.
    const hasManual = () => {
      try {
        const s = localStorage.getItem('yaride-theme');
        return s === 'light' || s === 'dark';
      } catch {
        return false;
      }
    };
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (!hasManual()) setTheme(tg.colorScheme);

      const handleThemeChange = () => {
        if (!hasManual()) setTheme(tg.colorScheme);
      };
      tg.onEvent('themeChanged', handleThemeChange);

      return () => {
        tg.offEvent('themeChanged', handleThemeChange);
      };
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        if (!hasManual()) setTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  // Загрузка точек маршрута для определения ID Брагино и Центра
  const routePointsState = useAsync(() => getRoutePoints(), []);

  // Находим ID точек Брагино и Центр
  const braginoId = routePointsState.status === 'success'
    ? routePointsState.data.points.find((p) => p.title.includes('Брагино'))?.id
    : undefined;
  const centrId = routePointsState.status === 'success'
    ? routePointsState.data.points.find((p) => p.title.includes('Центр'))?.id
    : undefined;

  // Загрузка поездок Брагино → Центр (morning/«в центр»)
  const morningTripsState = useAsync(
    () => {
      if (!braginoId || !centrId) return Promise.resolve([]);
      return getTrips({ corridor: `${braginoId}-${centrId}` }).then((res) => res.trips.map(mapTripListItemToTrip));
    },
    [braginoId, centrId]
  );

  // Загрузка поездок Центр → Брагино (evening/«из центра»)
  const eveningTripsState = useAsync(
    () => {
      if (!braginoId || !centrId) return Promise.resolve([]);
      return getTrips({ corridor: `${centrId}-${braginoId}` }).then((res) => res.trips.map(mapTripListItemToTrip));
    },
    [braginoId, centrId]
  );

  const morningTrips =
    morningTripsState.status === 'success' ? morningTripsState.data : [];
  const eveningTrips =
    eveningTripsState.status === 'success' ? eveningTripsState.data : [];

  // Управление splash: скрываем когда данные готовы или прошло ~2.5с
  useEffect(() => {
    // Проверяем готовность данных (не loading и не idle)
    const dataReady =
      routePointsState.status !== 'loading' &&
      routePointsState.status !== 'idle' &&
      morningTripsState.status !== 'loading' &&
      morningTripsState.status !== 'idle' &&
      eveningTripsState.status !== 'loading' &&
      eveningTripsState.status !== 'idle';

    // Минимальное время показа splash ~2.5с
    const minDisplayTimer = setTimeout(() => {
      if (splashVisible) {
        setSplashHiding(true);
      }
    }, 2500);

    // Если данные готовы раньше — всё равно ждём минимум
    if (dataReady && splashVisible) {
      // Не скрываем мгновенно, ждём минимум времени
      const checkTimer = setTimeout(() => {
        setSplashHiding(true);
      }, 2500);
      return () => {
        clearTimeout(minDisplayTimer);
        clearTimeout(checkTimer);
      };
    }

    return () => clearTimeout(minDisplayTimer);
  }, [
    routePointsState.status,
    morningTripsState.status,
    eveningTripsState.status,
    splashVisible,
  ]);

  // Текущая бронь (для передачи из booking-profile в booking-confirmed)
  const [currentBooking, setCurrentBooking] = useState<BookingResult | null>(null);

  // BackButton показываем везде, кроме «главных» (списки поездок с left-topbar
  // и нижней навигацией): intro/main/main-more/evening-main.
  const showBackButton = !['intro', 'main', 'main-more', 'evening-main'].includes(
    currentScreen
  );

  // Экраны, где показываем плавающую навигацию (и резервируем под неё место).
  const NAV_VISIBLE_SCREENS: Screen[] = [
    'main',
    'main-more',
    'trip-details',
    'profile',
    'evening-main',
  ];
  const navVisible = NAV_VISIBLE_SCREENS.includes(currentScreen);

  return (
    <ProfileProvider>
      <div
        className={theme}
        style={{
          minHeight: '100dvh',
          background: 'var(--background)',
        }}
      >
        <Icons />
        <ToastHost />
        <BackButton onClick={goBack} show={showBackButton} />
        {splashVisible && (
          <Splash
            onHide={splashHiding}
            onHidden={() => setSplashVisible(false)}
          />
        )}
        <div
          style={{
            maxWidth: isDesktop ? '430px' : 'none',
            margin: '0 auto',
            color: 'var(--foreground)',
            height: '100dvh',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
            overflowX: 'clip',
          }}
        >
<AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={currentScreen}
            custom={direction}
            variants={screenVariants}
            initial={prefersReducedMotion ? 'reducedInitial' : 'enter'}
            animate="center"
            exit={prefersReducedMotion ? 'reducedExit' : 'exit'}
            transition={
              prefersReducedMotion
                ? { duration: 0.12 }
                : { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 }
            }
            style={{
              display: 'flex',
              flexDirection: 'column',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              paddingBottom: navVisible ? FLOATING_NAV_CONTENT_PADDING : 'env(safe-area-inset-bottom)',
            }}
          >
            {currentScreen === 'intro' && <IntroScreen onRoleSelect={handleRoleSelect} />}
            {currentScreen === 'main' && (
              <MainScreen
                trips={mainDirection === 'morning' ? morningTrips : eveningTrips}
                title={mainDirection === 'morning' ? 'Брагино → Центр' : 'Центр → Брагино'}
                subtitle={
                  mainDirection === 'morning'
                    ? formatSubtitle('утро 7:30–8:40')
                    : formatSubtitle('вечер 17:00–18:30')
                }
                loading={
                  mainDirection === 'morning'
                    ? morningTripsState.status === 'loading'
                    : eveningTripsState.status === 'loading'
                }
                error={
                  mainDirection === 'morning'
                    ? morningTripsState.status === 'error'
                      ? morningTripsState.error
                      : undefined
                    : eveningTripsState.status === 'error'
                      ? eveningTripsState.error
                      : undefined
                }
                onRetry={mainDirection === 'morning' ? morningTripsState.retry : eveningTripsState.retry}
                onTripClick={(trip) => navigate('trip-details', trip)}
                onPublish={() => navigate(mainDirection === 'evening' ? 'evening-publish' : 'driver-publish')}
                onLeaveRequest={() => {
                  setRequestDirection(mainDirection);
                  navigate('passenger-request');
                }}
                onToggleDirection={() => {
                  window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light');
                  setMainDirection((prev) => (prev === 'morning' ? 'evening' : 'morning'));
                }}
                userRole={userRole ?? 'passenger'}
              />
            )}
            {currentScreen === 'main-more' && (
              <MainScreen
                trips={morningTrips}
                subtitle={formatSubtitle('утро 7:30–8:40', true)}
                loading={morningTripsState.status === 'loading'}
                error={morningTripsState.status === 'error' ? morningTripsState.error : undefined}
                onRetry={morningTripsState.retry}
                onTripClick={(trip) => navigate('trip-details', trip)}
                onPublish={() => navigate('driver-publish')}
                onLeaveRequest={() => navigate('passenger-request')}
                userRole={userRole ?? 'passenger'}
              />
            )}
            {currentScreen === 'trip-details' && selectedTrip && (
              <TripDetailsScreen trip={selectedTrip} onBook={() => navigate('booking-profile')} />
            )}
            {currentScreen === 'booking-profile' && selectedTrip && (
              <BookingProfileScreen
                trip={selectedTrip}
                onConfirm={(booking) => {
                  setCurrentBooking(booking);
                  navigate('booking-confirmed', null, 'booking');
                }}
              />
            )}
            {currentScreen === 'driver-publish' && (
              <DriverPublishScreen
                onPublish={(tripId) => navigate('booking-confirmed', null, 'publish', tripId)}
              />
            )}
            {currentScreen === 'booking-confirmed' && (
              <BookingConfirmedScreen
                kind={confirmKind}
                trip={selectedTrip}
                booking={confirmKind === 'booking' ? currentBooking : null}
                publishedTripId={confirmKind === 'publish' ? publishedTripId ?? undefined : undefined}
                onDone={() => navigate('main')}
                onViewBookings={() => navigate('driver-bookings')}
                onStartTrip={() => navigate('in-trip')}
              />
            )}
            {currentScreen === 'profile' && (
              <ProfileScreen
                onBecomeDriver={handleBecomeDriver}
                onLicenseReview={() => navigate('license-review')}
                onSafety={() => navigate('safety')}
                onMyTrips={() => navigate('my-trips')}
                onToggleTheme={toggleTheme}
                theme={theme}
              />
            )}
            {currentScreen === 'driver-bookings' && (
              <DriverBookingsScreen tripId={publishedTripId ?? undefined} onDone={() => navigate('main')} />
            )}
            {currentScreen === 'become-driver' && (
              <BecomeDriverScreen onSubmit={() => navigate('license-review')} />
            )}
            {currentScreen === 'license-review' && (
              <LicenseReviewScreen
                onFindRide={() => navigate('main')}
                onRetry={() => navigate('become-driver')}
              />
            )}
            {currentScreen === 'in-trip' && <InTripScreen trip={selectedTrip} />}
            {currentScreen === 'safety' && <SafetyScreen />}
            {currentScreen === 'passenger-request' && (
              <PassengerRequestScreen
                direction={requestDirection}
                onPublish={() => navigate('request-published')}
              />
            )}
            {currentScreen === 'request-published' && (
              <RequestPublishedScreen
                onEdit={() => navigate('passenger-request')}
                onCancel={goBack}
              />
            )}
            {currentScreen === 'my-trips' && (
              <MyTripsScreen
                onCreateTrip={() => navigate('driver-publish')}
                onRateTrip={(tripId, rateeId) => navigateToRateTrip({ tripId, rateeId })}
              />
            )}
            {currentScreen === 'rate-trip' && (
              <RateTripScreen ratingContext={ratingContext ?? undefined} onSubmit={goBack} onClose={goBack} />
            )}
            {currentScreen === 'evening-main' && (
              <MainScreen
                trips={eveningTrips}
                title="Центр → Брагино"
                subtitle={formatSubtitle('вечер 17:30–19:00')}
                heroKicker="Сегодня домой"
                loading={eveningTripsState.status === 'loading'}
                error={eveningTripsState.status === 'error' ? eveningTripsState.error : undefined}
                onRetry={eveningTripsState.retry}
                onTripClick={(trip) => navigate('trip-details', trip)}
                onPublish={() => navigate('evening-publish')}
                onLeaveRequest={() => navigate('passenger-request')}
                userRole={userRole ?? 'passenger'}
              />
            )}
            {currentScreen === 'evening-publish' && (
              <DriverPublishScreen
                title="Я за рулём · домой"
                timeOptions={['17:30', '17:40', '18:00', '18:30', 'другое']}
                defaultTime="17:40"
                routeLabel="Маршрут · обратный, из шаблона"
                defaultPickup="volkova"
                reverse={true}
                onPublish={(tripId) => navigate('booking-confirmed', null, 'publish', tripId)}
              />
            )}
          </motion.div>
        </AnimatePresence>
        </div>
        <FloatingNav
          currentScreen={currentScreen}
          onNavigate={(root) => navigate(root === 'profile' ? 'profile' : 'main')}
        />
      </div>
    </ProfileProvider>
  );
}

export default App;
