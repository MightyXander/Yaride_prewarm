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
import UserProfileScreen from './screens/UserProfileScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import AddCarScreen from './screens/AddCarScreen';
import { FloatingNav, FLOATING_NAV_CONTENT_PADDING } from './components/FloatingNav';
import { useNavigation } from './hooks/useNavigation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useAsync } from './hooks/useAsync';
import { useStartParam } from './hooks/useStartParam';
import { getTrips, getRoutePoints, getTrip } from './lib/api';
import { mapTripListItemToTrip, mapTripCardToTrip } from './lib/mappers';
import { showToast } from './lib/toast';
import { loadRole, saveRole, type UserRole } from './lib/role';
import { formatSubtitle } from './lib/date';
import { ProfileProvider } from './contexts/ProfileContext';
import type { Screen } from './types/navigation';
import type { BookingResult } from './types/api';
import type { NotificationType } from './types/api';

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

  // Splash уходит как только данные готовы (дав лого ~0.6с проявиться),
  // но не позже ~2.5с — жёсткий cap на медленных/зависших данных.
  useEffect(() => {
    if (!splashVisible) return;

    // Готовность данных: ни один источник не в loading/idle.
    const dataReady =
      routePointsState.status !== 'loading' &&
      routePointsState.status !== 'idle' &&
      morningTripsState.status !== 'loading' &&
      morningTripsState.status !== 'idle' &&
      eveningTripsState.status !== 'loading' &&
      eveningTripsState.status !== 'idle';

    // Потолок: уйти не позже ~2.5с в любом случае.
    const capTimer = setTimeout(() => setSplashHiding(true), 2500);
    // Данные готовы — уходим раньше (минимальный показ ~0.6с под анимацию лого).
    const readyTimer = dataReady
      ? setTimeout(() => setSplashHiding(true), 600)
      : undefined;

    return () => {
      clearTimeout(capTimer);
      if (readyTimer) clearTimeout(readyTimer);
    };
  }, [
    routePointsState.status,
    morningTripsState.status,
    eveningTripsState.status,
    splashVisible,
  ]);

  // Текущая бронь (для передачи из booking-profile в booking-confirmed)
  const [currentBooking, setCurrentBooking] = useState<BookingResult | null>(null);

  // Стек просмотренных профилей (для user-profile): [userId0, userId1, ...]
  // Максимальная глубина 2 (корневой + 1 вложенный)
  const [profileStack, setProfileStack] = useState<number[]>([]);

  // BackButton показываем везде, кроме «главных» (списки поездок с left-topbar
  // и нижней навигацией): intro/main/main-more/evening-main.
  // Для user-profile: показываем BackButton всегда (даже на корневом уровне — выход из профиля).
  const showBackButton = !['intro', 'main', 'main-more', 'evening-main'].includes(
    currentScreen
  );

  // Обработчики для user-profile навигации
  const handleOpenUserProfile = (userId: number) => {
    if (currentScreen !== 'user-profile') {
      // Первый вход в user-profile — создаём новый стек
      setProfileStack([userId]);
      navigate('user-profile');
    } else {
      // Уже в user-profile — добавляем в стек (если глубина < 2)
      setProfileStack((prev) => {
        if (prev.length >= 2) {
          // Глубина уже 2 — не добавляем
          return prev;
        }
        return [...prev, userId];
      });
    }
  };

  const handleUserProfileBack = () => {
    setProfileStack((prev) => {
      if (prev.length <= 1) {
        // Корневой уровень — выходим из user-profile
        goBack();
        return [];
      }
      // Снимаем верхний профиль
      return prev.slice(0, -1);
    });
  };

  // Открыть детали поездки по ID (из «Моих поездок»): дозагрузка карточки + переход.
  // Тот же путь, что у deep-link trip-<id>: getTrip → mapTripCardToTrip → trip-details.
  const handleOpenTripById = async (tripId: number) => {
    try {
      const res = await getTrip(tripId);
      navigate('trip-details', mapTripCardToTrip(res.trip));
    } catch {
      showToast('Не удалось открыть поездку');
    }
  };

  // Обработчик навигации из уведомлений (маршрутизация по типу)
  const handleNotificationNavigate = (
    type: NotificationType,
    refTripId?: number | null,
    refUserId?: number | null
  ) => {
    switch (type) {
      case 'booking':
        // бронь твоей поездки → DriverBookings («Мои поездки»)
        navigate('driver-bookings');
        break;
      case 'booking_confirmed':
        // твою бронь подтвердили → TripDetails
        if (refTripId) {
          // Пока navigate не поддерживает прямую передачу trip, переходим на my-trips
          navigate('my-trips');
        } else {
          navigate('my-trips');
        }
        break;
      case 'cancel':
        // отмена водителем/пассажиром → TripDetails (или my-trips)
        navigate('my-trips');
        break;
      case 'rate_reminder':
        // напоминание оценить → RateTrip
        if (refTripId && refUserId) {
          // raterRole по умолчанию 'passenger' (типовой случай — пассажир оценивает водителя);
          // совпадает с дефолтом RateTripScreen.
          navigateToRateTrip({ tripId: refTripId, rateeId: refUserId, raterRole: 'passenger' });
        } else {
          navigate('my-trips');
        }
        break;
      default:
        // fallback — вернуться на main
        navigate('main');
    }
  };

  // Экраны, где показываем плавающую навигацию (и резервируем под неё место).
  const NAV_VISIBLE_SCREENS: Screen[] = [
    'main',
    'main-more',
    'trip-details',
    'profile',
    'evening-main',
    'user-profile',
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
        <BackButton
          onClick={currentScreen === 'user-profile' ? handleUserProfileBack : goBack}
          show={showBackButton}
        />
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
                onOpenProfile={handleOpenUserProfile}
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
                onOpenProfile={handleOpenUserProfile}
              />
            )}
            {currentScreen === 'trip-details' && selectedTrip && (
              <TripDetailsScreen trip={selectedTrip} onBook={() => navigate('booking-profile')} onOpenProfile={handleOpenUserProfile} />
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
                onAddCar={() => navigate('add-car')}
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
                onMyCars={() => navigate('add-car')}
                onToggleTheme={toggleTheme}
                theme={theme}
                onOpenProfile={handleOpenUserProfile}
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
                onOpenTrip={handleOpenTripById}
                onRateTrip={(tripId, rateeId, raterRole) => navigateToRateTrip({ tripId, rateeId, raterRole })}
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
                onOpenProfile={handleOpenUserProfile}
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
                onAddCar={() => navigate('add-car')}
              />
            )}
            {currentScreen === 'user-profile' && profileStack.length > 0 && (
              <UserProfileScreen
                userId={profileStack[profileStack.length - 1]}
                depth={profileStack.length - 1}
                onOpenProfile={handleOpenUserProfile}
              />
            )}
            {currentScreen === 'notifications' && (
              <NotificationsScreen onNavigate={handleNotificationNavigate} />
            )}
            {currentScreen === 'add-car' && (
              <AddCarScreen onSaved={goBack} />
            )}
          </motion.div>
        </AnimatePresence>
        </div>
        <FloatingNav
          currentScreen={currentScreen}
          onNavigate={(root) => navigate(root === 'profile' ? 'profile' : 'main')}
          onNotificationsClick={() => navigate('notifications')}
        />
      </div>
    </ProfileProvider>
  );
}

export default App;
