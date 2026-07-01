import { useState, Suspense } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icons } from './components/Icons';
import BackButton from './components/BackButton';
import { ToastHost } from './components/ToastHost';
import Splash from './components/Splash';
import ErrorBoundary from './components/ErrorBoundary';
import { FloatingNav, FLOATING_NAV_CONTENT_PADDING } from './components/FloatingNav';
import { useNavigation } from './hooks/useNavigation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useStartParam } from './hooks/useStartParam';
import { useTheme } from './hooks/useTheme';
import { useCorridorTrips } from './hooks/useCorridorTrips';
import { useSplashGate } from './hooks/useSplashGate';
import { useAuthHandlers } from './hooks/useAuthHandlers';
import { useRoleHandlers } from './hooks/useRoleHandlers';
import { usePublishHandlers } from './hooks/usePublishHandlers';
import { useTripHandlers } from './hooks/useTripHandlers';
import { useUserProfileNav } from './hooks/useUserProfileNav';
import { loadRole, type UserRole } from './lib/role';
import { shouldGateBrowserAuth } from './lib/auth';
import { ProfileProvider } from './contexts/ProfileContext';
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
const NAV_VISIBLE_SCREENS: Screen[] = ['main', 'main-more', 'trip-details', 'profile', 'evening-main', 'user-profile'];
// BackButton скрываем на «главных» (списки поездок) и веб-флоу авторизации (без back-хрома).
const NO_BACK_BUTTON_SCREENS: Screen[] = ['auth-gate', 'login', 'register', 'intro', 'main', 'main-more', 'evening-main'];

function App() {
  const { theme, toggleTheme } = useTheme();

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

  const { currentScreen, selectedTrip, confirmKind, ratingContext, publishedTripId, direction, navigate, navigateToRateTrip, goBack } =
    useNavigation(initialScreen);
  const prefersReducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 430px)');

  // Направление поездки на главном экране (morning/evening)
  const [mainDirection, setMainDirection] = useState<'morning' | 'evening'>('morning');
  // Направление для заявки пассажира (передаётся при открытии формы)
  const [requestDirection, setRequestDirection] = useState<'morning' | 'evening'>('morning');

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
  useStartParam(navigate, undefined, !needsAuthGate);

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
  });

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
    handleNotificationNavigate,
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
            <ErrorBoundary resetKey={currentScreen}>
            <Suspense fallback={null}>
            {screenRegistry[currentScreen]?.(screenCtx)}
            </Suspense>
            </ErrorBoundary>
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
