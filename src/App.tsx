import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icons } from './components/Icons';
import BackButton from './components/BackButton';
import { ToastHost } from './components/ToastHost';
import Splash from './components/Splash';
import ErrorBoundary from './components/ErrorBoundary';
import IntroScreen from './screens/IntroScreen';
import MainScreen from './screens/MainScreen';
// Не-стартовые экраны грузим лениво (code-splitting) — режет initial-бандл и TTI.
// IntroScreen и MainScreen остаются в основном бандле (первый рендер).
const TripDetailsScreen = lazy(() => import('./screens/TripDetailsScreen'));
const BookingProfileScreen = lazy(() => import('./screens/BookingProfileScreen'));
const DriverPublishScreen = lazy(() => import('./screens/DriverPublishScreen'));
const BookingConfirmedScreen = lazy(() => import('./screens/BookingConfirmedScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const DriverBookingsScreen = lazy(() => import('./screens/DriverBookingsScreen'));
const BecomeDriverScreen = lazy(() => import('./screens/BecomeDriverScreen'));
const LicenseReviewScreen = lazy(() => import('./screens/LicenseReviewScreen'));
const InTripScreen = lazy(() => import('./screens/InTripScreen'));
const SafetyScreen = lazy(() => import('./screens/SafetyScreen'));
const PassengerRequestScreen = lazy(() => import('./screens/PassengerRequestScreen'));
const RequestPublishedScreen = lazy(() => import('./screens/RequestPublishedScreen'));
const MyTripsScreen = lazy(() => import('./screens/MyTripsScreen'));
const RateTripScreen = lazy(() => import('./screens/RateTripScreen'));
const UserProfileScreen = lazy(() => import('./screens/UserProfileScreen'));
const NotificationsScreen = lazy(() => import('./screens/NotificationsScreen'));
const AddCarScreen = lazy(() => import('./screens/AddCarScreen'));
const MyCarsScreen = lazy(() => import('./screens/MyCarsScreen'));
const AuthGateScreen = lazy(() => import('./screens/AuthGateScreen'));
const LoginScreen = lazy(() => import('./screens/LoginScreen'));
const RegisterScreen = lazy(() => import('./screens/RegisterScreen'));
import { FloatingNav, FLOATING_NAV_CONTENT_PADDING } from './components/FloatingNav';
import { useNavigation } from './hooks/useNavigation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useAsync } from './hooks/useAsync';
import { useRefetchOnFocus, usePollingRefetch } from './hooks/useRefetchOnFocus';
import { useStartParam } from './hooks/useStartParam';
import { getTrips, getRoutePoints, getTrip, cancelTrip, getMe, loginUser, registerUser, logoutUser, ApiException } from './lib/api';
import { mapTripListItemToTrip, mapTripCardToTrip } from './lib/mappers';
import { showToast } from './lib/toast';
import { loadRole, saveRole, type UserRole } from './lib/role';
import { isTelegramContext, shouldGateBrowserAuth } from './lib/auth';
import { POLICY_VERSION } from './lib/policy';
import type { RegisterPayload } from './screens/RegisterScreen';
import { formatSubtitle } from './lib/date';
import { ProfileProvider } from './contexts/ProfileContext';
import type { Screen, PublishedTripSummary } from './types/navigation';
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
    // Баг ревью #5: тему из Telegram берём только в реальном Telegram-контексте.
    // В браузере (где window.Telegram.WebApp существует, но platform='unknown')
    // используем prefers-color-scheme, иначе тема залипает на дефолте Telegram.
    if (isTelegramContext() && window.Telegram?.WebApp) {
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

  // --- Авторизация (#242): реальная серверная сессия ---
  // Куда вести после успешного входа: роль есть → main, нет → intro (как обычный старт).
  const afterAuth = () => {
    navigate(userRole ? 'main' : 'intro');
  };

  // Вход по email: реальный вызов API. Ошибки/loading обрабатывает LoginScreen
  // (контракт onSubmit — async; экран await'ит и на ошибке сбрасывает loading).
  const handleAuthLogin = async (email: string, password: string) => {
    await loginUser({ email, password });
    setAuthed(true);
    afterAuth();
  };

  // Регистрация: реальный вызов API. Версия политики — единый источник POLICY_VERSION.
  // marketingConsent пишем только если пользователь отметил «новости и акции».
  const handleAuthRegister = async (payload: RegisterPayload) => {
    await registerUser({
      email: payload.email,
      password: payload.password,
      username: payload.username,
      firstName: payload.firstName,
      lastName: payload.lastName,
      pdnConsent: true,
      pdnConsentVersion: POLICY_VERSION,
      marketingConsent: payload.news,
      marketingConsentVersion: payload.news ? POLICY_VERSION : undefined,
    });
    setAuthed(true);
    afterAuth();
  };

  // «Войти через Telegram» из браузерного гейта — пока заглушка (привязка TG к
  // браузерной карточке вне MVP, см. issue #242). Просто уводим со страницы гейта.
  const handleAuthTelegram = () => {
    afterAuth();
  };

  // Выход: рвём серверную сессию, сбрасываем флаг, возвращаемся на гейт.
  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      /* даже при ошибке сети уводим пользователя на гейт */
    }
    setAuthed(false);
    navigate('auth-gate');
  };

  // При старте в браузере проверяем серверную сессию (GET /api/auth/me).
  // Успех → считаем вошедшим и уводим с гейта; 401 → остаёмся на гейте.
  useEffect(() => {
    if (!gateContext) return;
    let cancelled = false;
    getMe()
      .then(() => {
        if (cancelled) return;
        setAuthed(true);
        navigate(userRole ? 'main' : 'intro');
      })
      .catch(() => {
        /* нет сессии — гейт остаётся */
      })
      .finally(() => {
        if (!cancelled) setMeChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // Один раз при маунте: проверка восстановления сессии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link обработка: при старте Mini App с start_param (например, 'trip-123')
  // открываем экран поездки. Баг ревью #2: deep-link НЕ должен обходить гейт —
  // включаем только когда гейт снят (!needsAuthGate).
  useStartParam(navigate, undefined, !needsAuthGate);

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
    // Баг ревью #5: ветку выбора темы определяем по реальному Telegram-контексту,
    // а не по простому наличию window.Telegram.WebApp (которое есть и в браузере).
    const tg = window.Telegram?.WebApp;
    if (isTelegramContext() && tg) {
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

  // --- Авто-обновление списков коридора (#258 «данные протухают») ---
  // Списки поездок живут на уровне App (не размонтируются при навигации между
  // экранами), поэтому после публикации/брони/отмены они оставались устаревшими
  // до перезагрузки. Перефетчим их: при возврате фокуса/видимости вкладки,
  // при входе на экран-коридор и лёгким периодическим обновлением, пока он открыт.
  const refetchCorridor = useCallback(() => {
    // Тихий рефетч (refetch): без скелета поверх уже показанного списка.
    morningTripsState.refetch();
    eveningTripsState.refetch();
    // refetch стабильна по [braginoId, centrId]; пересоздаётся только при их смене.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morningTripsState.refetch, eveningTripsState.refetch]);

  // Экраны-коридоры (списки поездок) — где обновление списка имеет смысл.
  const CORRIDOR_SCREENS: Screen[] = ['main', 'main-more', 'evening-main'];
  const onCorridorScreen = CORRIDOR_SCREENS.includes(currentScreen);

  // 1) Возврат фокуса/видимости вкладки → свежие списки (одобрение ВУ, новые поездки).
  useRefetchOnFocus(refetchCorridor);

  // 2) Вход на экран-коридор из НЕ-коридора → перефетч (после публикации/отмены поездки,
  //    когда onDone уводит на 'main'). На первом маунте не дёргаем — useAsync уже грузит.
  const prevScreenRef = useRef(currentScreen);
  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = currentScreen;
    const entering = CORRIDOR_SCREENS.includes(currentScreen) && !CORRIDOR_SCREENS.includes(prev);
    if (entering) refetchCorridor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen, refetchCorridor]);

  // 3) Лёгкий периодический рефетч, пока открыт коридор (≈30с, пауза при скрытой вкладке).
  usePollingRefetch(refetchCorridor, 30_000, onCorridorScreen);

  // Splash уходит как только данные готовы (дав лого ~0.6с проявиться),
  // но не позже ~2.5с — жёсткий cap на медленных/зависших данных.
  useEffect(() => {
    if (!splashVisible) return;

    // Готовность данных: ни один источник не в loading/idle И проверена сессия
    // (meChecked) — чтобы первый кадр после splash не мигал гейтом до ответа /me.
    const dataReady =
      meChecked &&
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
    meChecked,
  ]);

  // Текущая бронь (для передачи из booking-profile в booking-confirmed)
  const [currentBooking, setCurrentBooking] = useState<BookingResult | null>(null);
  // Сводка последней опубликованной поездки — для экрана «Поездка опубликована».
  const [publishedTrip, setPublishedTrip] = useState<PublishedTripSummary | null>(null);

  // Стек просмотренных профилей (для user-profile): [userId0, userId1, ...]
  // Максимальная глубина 2 (корневой + 1 вложенный)
  const [profileStack, setProfileStack] = useState<number[]>([]);

  // BackButton показываем везде, кроме «главных» (списки поездок с left-topbar
  // и нижней навигацией): intro/main/main-more/evening-main.
  // Для user-profile: показываем BackButton всегда (даже на корневом уровне — выход из профиля).
  // Auth-экраны (gate/login/register) — веб-флоу без back-хрома (как в макете): на login/register
  // плавающая кнопка «Назад» иначе перекрыла бы логотип; переходы доступны in-screen ссылками.
  const showBackButton = !['auth-gate', 'login', 'register', 'intro', 'main', 'main-more', 'evening-main'].includes(
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
  const handleOpenTripById = async (tripId: number, backTo: Screen = 'my-trips') => {
    try {
      const res = await getTrip(tripId);
      // backTo — куда вернёт «Назад» (по умолчанию «Мои поездки»; из уведомлений — обратно в ленту)
      navigate('trip-details', mapTripCardToTrip(res.trip), undefined, undefined, backTo);
    } catch {
      showToast('Не удалось открыть поездку');
    }
  };

  // Отменить свою поездку (водитель в деталях поездки): API + тост + возврат в «Мои поездки».
  const handleCancelOwnTrip = async () => {
    const t = selectedTrip;
    if (!t) return;
    try {
      await cancelTrip(Number(t.id));
      showToast('Поездка отменена');
      navigate('my-trips');
    } catch (e) {
      showToast(e instanceof ApiException ? e.message : 'Не удалось отменить поездку');
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
        // бронь твоей поездки → DriverBookings («Мои поездки» по этой поездке).
        // refTripId прокидываем в слот publishedTripId — DriverBookings читает tripId оттуда;
        // без него экран показал бы «ID поездки не передан».
        if (refTripId) {
          navigate('driver-bookings', null, undefined, refTripId);
        } else {
          navigate('my-trips');
        }
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
      case 'trip_new':
        // поездка по твоему маршруту → детали поездки (назад — в ленту)
        if (refTripId) {
          void handleOpenTripById(refTripId, 'notifications');
        } else {
          navigate('main');
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
            <ErrorBoundary resetKey={currentScreen}>
            <Suspense fallback={null}>
            {currentScreen === 'auth-gate' && (
              <AuthGateScreen
                onTelegram={handleAuthTelegram}
                onLogin={() => navigate('login')}
                onRegister={() => navigate('register')}
              />
            )}
            {currentScreen === 'login' && (
              <LoginScreen
                onSubmit={handleAuthLogin}
                onTelegram={handleAuthTelegram}
                onRegister={() => navigate('register')}
              />
            )}
            {currentScreen === 'register' && (
              <RegisterScreen onSubmit={handleAuthRegister} onLogin={() => navigate('login')} />
            )}
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
              <TripDetailsScreen trip={selectedTrip} onBook={() => navigate('booking-profile')} onOpenProfile={handleOpenUserProfile} onCancelTrip={handleCancelOwnTrip} />
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
                onPublish={(summary) => {
                  setPublishedTrip(summary);
                  navigate('booking-confirmed', null, 'publish', summary.tripId);
                }}
                onAddCar={() => navigate('add-car')}
              />
            )}
            {currentScreen === 'booking-confirmed' && (
              <BookingConfirmedScreen
                kind={confirmKind}
                trip={selectedTrip}
                booking={confirmKind === 'booking' ? currentBooking : null}
                publishedTripId={confirmKind === 'publish' ? publishedTripId ?? undefined : undefined}
                publishedTrip={confirmKind === 'publish' ? publishedTrip : null}
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
                onMyCars={() => navigate('my-cars')}
                onToggleTheme={toggleTheme}
                theme={theme}
                onOpenProfile={handleOpenUserProfile}
                onLogout={gateContext ? handleLogout : undefined}
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
                onPublish={(summary) => {
                  setPublishedTrip(summary);
                  navigate('booking-confirmed', null, 'publish', summary.tripId);
                }}
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
            {currentScreen === 'my-cars' && (
              <MyCarsScreen onAddCar={() => navigate('add-car', null, undefined, undefined, 'my-cars')} />
            )}
            {currentScreen === 'add-car' && (
              <AddCarScreen onSaved={goBack} />
            )}
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
