import { useState, useEffect, Suspense } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icons } from './components/Icons';
import BackButton from './components/BackButton';
import { ToastHost } from './components/ToastHost';
import Splash from './components/Splash';
import ErrorBoundary from './components/ErrorBoundary';
import ScreenSkeleton from './components/ScreenSkeleton';
import { FloatingNav, FLOATING_NAV_CONTENT_PADDING } from './components/FloatingNav';
import { DesktopNav } from './components/DesktopNav';
import { useNavigation } from './hooks/useNavigation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT, DESKTOP_MAX_PX, MOBILE_COLUMN_PX } from './lib/layout';
import { useStartParam } from './hooks/useStartParam';
import { useTheme } from './hooks/useTheme';
import { useCorridorTrips } from './hooks/useCorridorTrips';
import { useSplashGate } from './hooks/useSplashGate';
import { useAuthHandlers } from './hooks/useAuthHandlers';
import { useRoleHandlers } from './hooks/useRoleHandlers';
import { usePublishHandlers } from './hooks/usePublishHandlers';
import { useTripHandlers } from './hooks/useTripHandlers';
import { useAlertHandlers } from './hooks/useAlertHandlers';
import { useUserProfileNav } from './hooks/useUserProfileNav';
import { loadRole, type UserRole } from './lib/role';
import { shouldGateBrowserAuth } from './lib/auth';
import { showToast } from './lib/toast';
import { ProfileProvider } from './contexts/ProfileContext';
import { prefetchScreenData } from './lib/screenDataCache';
import { fetchNotifications } from './lib/screenFetchers';
import { screenRegistry } from './lib/screenRegistry';
import type { ScreenCtx } from './lib/screenRegistry';
import type { Screen } from './types/navigation';

// Направленный слайд + fade при смене экрана. direction: 1 — вперёд, -1 — назад.
const screenVariants = {
  enter: (dir: 1 | -1) => ({ x: dir * 28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir * -28, opacity: 0 }),
  // При prefers-reduced-motion — только лёгкий fade, без сдвига.
  reducedInitial: { x: 0, opacity: 0 },
  reducedExit: { x: 0, opacity: 0 },
};

// Экраны, где показываем плавающую навигацию (и резервируем под неё место).
const NAV_VISIBLE_SCREENS: Screen[] = ['main', 'main-more', 'trip-details', 'profile', 'evening-main', 'user-profile', 'my-trips', 'my-cars', 'my-alerts', 'safety', 'passenger-request'];
// BackButton скрываем на «главных» (списки поездок) и веб-флоу авторизации (без back-хрома).
const NO_BACK_BUTTON_SCREENS: Screen[] = ['auth-gate', 'login', 'register', 'intro', 'main', 'main-more', 'evening-main'];

function App() {
  const { theme, themeMode, setThemeMode, toggleTheme } = useTheme();

  // Роль пользователя: пассажир или водитель (персистится в localStorage)
  const [userRole, setUserRole] = useState<UserRole | null>(() => loadRole());

  // Браузерная авторизация (#242): реальная серверная сессия (httpOnly-cookie + /me).
  // Гейт показываем ТОЛЬКО в уверенном браузере (fail-safe, shouldGateBrowserAuth)
  // и пока сессия не подтверждена бэкендом. Telegram-флоу не затрагивается.
  const gateContext = shouldGateBrowserAuth();
  const [authed, setAuthed] = useState(false);
  // meChecked — дёрнули ли уже GET /api/auth/me. В Telegram/неуверенном контексте
  // проверка не нужна → сразу true (splash не ждёт).
  const [meChecked, setMeChecked] = useState(!gateContext);

  const needsAuthGate = gateContext && !authed;

  // Начальный экран: нужен гейт → auth-gate (скорректируем, если /me вернёт сессию);
  // иначе роль выбрана — main, нет — intro.
  const initialScreen: Screen = needsAuthGate ? 'auth-gate' : userRole ? 'main' : 'intro';

  const { currentScreen, selectedTrip, confirmKind, ratingContext, publishedTripId, direction, navigate, navigateToRateTrip, goBack, resetTo } =
    useNavigation(initialScreen);
  const prefersReducedMotion = useReducedMotion();
  // ≥900px — десктоп-раскладка (широкий контент + верхняя навигация); <900px и Telegram —
  // прежняя мобильная колонка (issue #365; было '(min-width: 430px)' — единственный кап).
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);

  // Направление поездки на главном экране (morning/evening)
  const [mainDirection, setMainDirection] = useState<'morning' | 'evening'>('morning');
  // Направление для заявки пассажира (передаётся при открытии формы)
  const [requestDirection, setRequestDirection] = useState<'morning' | 'evening'>('morning');
  // Пассажир, чью бронь подсветить блюр-сценкой в TripDetailsScreen при заходе
  // из уведомления о новой брони (issue #339). null — сценка не играется.
  const [bookingFocusUserId, setBookingFocusUserId] = useState<number | null>(null);

  const { handleRoleSelect, handleBecomeDriver } = useRoleHandlers({ setUserRole, navigate });

  const { handleAuthLogin, handleAuthRegister, handleAuthTelegram, handleLogout } = useAuthHandlers({
    gateContext,
    userRole,
    navigate,
    setAuthed,
    setMeChecked,
  });

  // Deep-link обработка: при старте Mini App с start_param (например, 'trip-123')
  // открываем экран поездки. Баг ревью #2: deep-link НЕ должен обходить гейт —
  // включаем только когда гейт снят (!needsAuthGate).
  // onError=showToast (issue #304/#236): если поездка недоступна, пользователь
  // должен увидеть тост «Поездка не найдена», а не молча оказаться на MainScreen.
  useStartParam(navigate, showToast, !needsAuthGate);

  const { routePointsState, morningTripsState, eveningTripsState, morningTrips, eveningTrips } =
    useCorridorTrips(currentScreen);

  const { splashVisible, splashHiding, setSplashVisible } = useSplashGate({
    meChecked,
    routePointsStatus: routePointsState.status,
    morningStatus: morningTripsState.status,
    eveningStatus: eveningTripsState.status,
  });

  const { currentBooking, publishedTrip, handleBookingConfirm, handlePublish } = usePublishHandlers({ navigate });

  const { profileStack, handleOpenUserProfile, handleUserProfileBack } = useUserProfileNav({
    currentScreen,
    navigate,
    goBack,
  });

  const { handleOpenTripById, handleCancelOwnTrip, handleNotificationNavigate } = useTripHandlers({
    selectedTrip,
    navigate,
    navigateToRateTrip,
    setBookingFocusUserId,
  });

  const { handleCancelAlert } = useAlertHandlers({ alertId: publishedTripId, navigate });

  // Idle-прогрев кэша уведомлений (issue #352): колокол доступен отовсюду
  // (FloatingNav), поэтому греем один раз при старте приложения, а не при
  // заходе на конкретный экран — requestIdleCallback не блокирует первый
  // рендер; в браузерах без него (Safari) — fallback на setTimeout.
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const warm = () => {
      void prefetchScreenData('notifications', fetchNotifications);
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(warm);
      return () => win.cancelIdleCallback?.(id);
    }

    const timeoutId = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const showBackButton = !NO_BACK_BUTTON_SCREENS.includes(currentScreen);
  const navVisible = NAV_VISIBLE_SCREENS.includes(currentScreen);

  // Контекст экрана: всё, что реестру (src/lib/screenRegistry.tsx) нужно, чтобы
  // отрендерить текущий экран — App сам деталей отдельных экранов не знает (issue #290).
  const screenCtx: ScreenCtx = {
    navigate,
    goBack,
    navigateToRateTrip,
    selectedTrip,
    confirmKind,
    publishedTripId,
    ratingContext,
    theme,
    themeMode,
    setThemeMode,
    toggleTheme,
    userRole,
    mainDirection,
    setMainDirection,
    morningTrips,
    eveningTrips,
    morningTripsState,
    eveningTripsState,
    requestDirection,
    setRequestDirection,
    currentBooking,
    publishedTrip,
    handleBookingConfirm,
    handlePublish,
    handleRoleSelect,
    handleBecomeDriver,
    handleAuthLogin,
    handleAuthRegister,
    handleAuthTelegram,
    handleLogout,
    gateContext,
    handleOpenUserProfile,
    profileStack,
    handleOpenTripById,
    handleCancelOwnTrip,
    handleCancelAlert,
    handleNotificationNavigate,
    bookingFocusUserId,
    setBookingFocusUserId,
  };

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
          currentScreen={currentScreen}
        />
        {splashVisible && (
          <Splash
            onHide={splashHiding}
            onHidden={() => setSplashVisible(false)}
          />
        )}
        <div
          style={{
            // На десктопе (≥900px) кап не 430px-колонка, а широкий центрированный контент
            // (issue #365); ниже 900 — прежняя мобильная колонка без изменений.
            maxWidth: isDesktop ? `${DESKTOP_MAX_PX}px` : `${MOBILE_COLUMN_PX}px`,
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
        {isDesktop && (
          <DesktopNav
            currentScreen={currentScreen}
            onNavigate={(root) => resetTo(root === 'profile' ? 'profile' : 'main')}
            onNotificationsClick={() => navigate('notifications')}
          />
        )}
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
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
              paddingBottom:
                navVisible && !isDesktop ? FLOATING_NAV_CONTENT_PADDING : 'env(safe-area-inset-bottom)',
            }}
          >
            <ErrorBoundary resetKey={currentScreen}>
            <Suspense fallback={<ScreenSkeleton />}>
            {screenRegistry[currentScreen]?.(screenCtx)}
            </Suspense>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
        </div>
        </div>
        {!isDesktop && (
          <FloatingNav
            currentScreen={currentScreen}
            onNavigate={(root) => resetTo(root === 'profile' ? 'profile' : 'main')}
            onNotificationsClick={() => navigate('notifications')}
          />
        )}
      </div>
    </ProfileProvider>
  );
}

export default App;
