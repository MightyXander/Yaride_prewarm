import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icons } from './components/Icons';
import BackButton from './components/BackButton';
import { ToastHost } from './components/ToastHost';
import Splash from './components/Splash';
import ErrorBoundary from './components/ErrorBoundary';
import ScreenSkeleton from './components/ScreenSkeleton';
import { FloatingNav, FLOATING_NAV_CONTENT_PADDING } from './components/FloatingNav';
import { DesktopSidebar } from './components/DesktopSidebar';
import { useNavigation } from './hooks/useNavigation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useTabSwipe, SWIPE_SCREENS, SCREEN_TAB, TAB_ORDER } from './hooks/useTabSwipe';
import { DESKTOP_BREAKPOINT, DESKTOP_MAX_PX, MOBILE_COLUMN_PX } from './lib/layout';
import { useStartParam, hasStartParam } from './hooks/useStartParam';
import { loadLastScreen, clearLastScreen, clearLegacyLastScreen } from './lib/lastScreen';
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
import { shouldGateBrowserAuth, isTelegramContext } from './lib/auth';
import { showToast } from './lib/toast';
import { ProfileProvider } from './contexts/ProfileContext';
import { AppCacheWarmer } from './lib/appPrefetch';
import { screenRegistry } from './lib/screenRegistry';
import type { ScreenCtx } from './lib/screenRegistry';
import type { TabRoot } from './hooks/useNavigation';
import type { Screen } from './types/navigation';

// Смена экрана: переходы между разделами карусели (tab=true, issue #415) — полноэкранный
// направленный слайд без fade (старый уезжает, новый въезжает одновременно); прочие
// переходы — прежний микро-слайд x:±28px + fade. dir: 1 — вперёд, -1 — назад.
// seam=true (issue #422): переход уже совершён визуально live-scrub-слоем — enter/exit
// мгновенны (duration 0), никакого повторного слайда (иначе видимый скачок при commit).
const screenVariants = {
  enter: ({ dir, tab, seam }: { dir: 1 | -1; tab: boolean; seam: boolean }) =>
    seam
      ? { x: 0, opacity: 1, transition: { duration: 0 } }
      : tab
        ? { x: `${dir * 100}%`, opacity: 1 }
        : { x: dir * 28, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: ({ dir, tab, seam }: { dir: 1 | -1; tab: boolean; seam: boolean }) =>
    seam
      ? { x: `${dir * -100}%`, opacity: 1, transition: { duration: 0 } }
      : tab
        ? { x: `${dir * -100}%`, opacity: 1 }
        : { x: dir * -28, opacity: 0 },
  // При prefers-reduced-motion — только лёгкий fade, без сдвига; seam — мгновенно
  // (переход уже совершён скрабом, даже fade дал бы лишнее мигание).
  reducedInitial: ({ seam }: { seam: boolean }) =>
    seam ? { x: 0, opacity: 1, transition: { duration: 0 } } : { x: 0, opacity: 0 },
  reducedExit: ({ seam }: { seam: boolean }) =>
    seam ? { x: 0, opacity: 0, transition: { duration: 0 } } : { x: 0, opacity: 0 },
};

// Корневой экран раздела — его рендерит scrub-слой как preview соседа.
const TAB_ROOT_SCREEN: Record<TabRoot, Screen> = {
  notifications: 'notifications',
  main: 'main',
  profile: 'profile',
};

// Базовая длительность доводки commit/отката прогресса после отпускания (мс).
const SCRUB_SETTLE_MS = 200;

// Экраны, где показываем плавающую навигацию (и резервируем под неё место).
const NAV_VISIBLE_SCREENS: Screen[] = ['main', 'main-more', 'trip-details', 'profile', 'evening-main', 'user-profile', 'my-trips', 'my-cars', 'my-alerts', 'safety', 'passenger-request'];
// BackButton скрываем на «главных» (списки поездок), корневых разделах карусели
// (уведомления/профиль — достижимы табами, «назад» некуда) и веб-флоу авторизации.
const NO_BACK_BUTTON_SCREENS: Screen[] = ['auth-gate', 'intro', 'main', 'main-more', 'evening-main', 'notifications', 'profile'];
// Веб-флоу авторизации: в браузере back-хром не показываем (нет куда возвращаться),
// а в Telegram нативную кнопку «назад» сохраняем (issue #412, после #408).
const AUTH_SCREENS: Screen[] = ['login', 'register'];

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

  // Снимок localStorage строго на момент первого рендера (лениво, один раз):
  // useNavigation ниже сам пишет в тот же ключ уже в первом эффекте после монтирования
  // (currentScreen === initialScreen), и если читать через loadLastScreen() внутри
  // ЭФФЕКТА (а не во время рендера), эффект useNavigation успевает отработать первым
  // (хук вызван раньше в теле компонента) и затирает сохранённый trip-details на
  // 'main' до того, как восстановление его увидит. Синхронный снимок в рендере
  // от этой гонки не зависит.
  // Заодно чистим протухший sessionStorage-ключ v1 (issue #392 → #402: перешли
  // на localStorage) — один раз за время жизни модуля, до первого чтения нового ключа.
  const [savedEntryAtMount] = useState(() => {
    clearLegacyLastScreen();
    return loadLastScreen();
  });

  // Восстановление последнего экрана (issue #392, #402), приоритеты:
  // 1) needsAuthGate — гейт не обходим никогда, восстановление не читаем;
  // 2) deep-link (tgWebAppStartParam) — явное намерение сильнее восстановления,
  //    его обрабатывает useStartParam ниже и он в любом случае перезапишет
  //    currentScreen эффектом после монтирования; здесь дополнительно не
  //    читаем сохранённый trip-details, чтобы не запускать гонку двух фетчей;
  // 3) сохранённый экран из whitelist (lastScreen.ts уже свёл его к main/
  //    self-fetching экрану/trip-details при записи);
  // 4) дефолт как раньше.
  const savedScreenEntry = !needsAuthGate && !hasStartParam() ? savedEntryAtMount : null;
  const restoredScreen: Screen | null =
    savedScreenEntry && savedScreenEntry.screen !== 'trip-details' ? savedScreenEntry.screen : null;

  // Начальный экран: нужен гейт → auth-gate (скорректируем, если /me вернёт сессию);
  // иначе сохранённый экран (если есть) → он; иначе роль выбрана — main, нет — intro.
  // trip-details восстанавливается отдельно, асинхронно (см. эффект ниже): стартуем
  // на main, тут же дозагружаем поездку по сохранённому id.
  const initialScreen: Screen = needsAuthGate
    ? 'auth-gate'
    : restoredScreen
      ? restoredScreen
      : userRole
        ? 'main'
        : 'intro';

  const { currentScreen, selectedTrip, confirmKind, ratingContext, publishedTripId, direction, isTabTransition, navigate, navigateToRateTrip, goBack, resetTo, switchTab } =
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

  const { handleAuthLogin, handleAuthRegister, handleLogout } = useAuthHandlers({
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

  // Асинхронное восстановление trip-details (issue #392): стартовали на main
  // (initialScreen выше), теперь дозагружаем сохранённую поездку тем же путём,
  // что и «Мои поездки»/уведомления. tripRestoreProcessed — гвард на один запуск
  // (эффект перезапускается по needsAuthGate, пока гейт не снят — не восстанавливаем).
  // Ошибка загрузки (поездка удалена/404) — handleOpenTripById молча остаётся
  // на main (тостом предупредит пользователя), новый currentScreen ('main')
  // тут же перезапишет протухший ключ в localStorage.
  const tripRestoreProcessed = useRef(false);
  useEffect(() => {
    if (needsAuthGate) return;
    if (tripRestoreProcessed.current) return;
    tripRestoreProcessed.current = true;

    // Deep-link сильнее восстановления (развилка #2) — если есть start_param,
    // его логика (useStartParam) сама решит, куда перейти.
    if (hasStartParam()) return;

    // savedEntryAtMount, а не loadLastScreen() — к этому моменту useNavigation
    // уже мог перезаписать ключ на 'main' (см. комментарий у savedEntryAtMount выше).
    const saved = savedEntryAtMount;
    if (saved?.screen !== 'trip-details') return;

    const tripIdNum = saved.tripId ? Number(saved.tripId) : NaN;
    if (!Number.isFinite(tripIdNum) || tripIdNum <= 0) {
      clearLastScreen();
      return;
    }

    void handleOpenTripById(tripIdNum, 'main');
  }, [needsAuthGate, handleOpenTripById, savedEntryAtMount]);

  // Idle-прогрев кэшей ВСЕХ разделов (issue #414, включает прежний прогрев
  // уведомлений из #352) — живёт в AppCacheWarmer внутри ProfileProvider
  // (нужен profile.id из контекста), см. src/lib/appPrefetch.ts.

  // На auth-экранах (login/register) back показываем ТОЛЬКО в Telegram-контексте:
  // в браузере fallback-кнопка не нужна, нативную Telegram-кнопку сохраняем (issue #412).
  const showBackButton =
    !NO_BACK_BUTTON_SCREENS.includes(currentScreen) &&
    (!AUTH_SCREENS.includes(currentScreen) || isTelegramContext());
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

  // --- Живой скраб карусели: СКВОЗНОЙ непрерывный offset (issue #422, паритет с
  // Android PageController). scrubOffset — абсолютная дробная позиция в разделах
  // (0 — уведомления, 1 — главная, 2 — профиль); null — обычный режим (keyed-экран).
  // Один непрерывный offset тянут оба источника (палец по экрану / drag каретки) и
  // его же получает каретка навбара. Прерывание доводки новым жестом — продолжение
  // от текущего offset: без коммит-снапа и скачков, цепочки (край→центр→другой край)
  // бесшовны в обе стороны.
  const [scrubOffset, setScrubOffsetState] = useState<number | null>(null);
  const scrubOffsetRef = useRef<number | null>(null);
  const setScrubOffset = useCallback((v: number | null) => {
    scrubOffsetRef.current = v;
    setScrubOffsetState(v);
  }, []);
  // seamNav: keyed-экран целевого раздела монтируется мгновенно (variants seam) —
  // strip уже показал его на месте, иначе повторный слайд при завершении.
  const [seamNav, setSeamNav] = useState(false);
  // Экран, с которого начат скраб (может быть под-экраном раздела, напр. main-more):
  // strip рендерит его на слоте своего раздела, соседи — корневые экраны.
  const scrubOriginScreenRef = useRef<Screen>(currentScreen);
  // Активный источник за раз: палец по экрану ИЛИ drag каретки.
  const scrubSourceRef = useRef<'swipe' | 'caret' | null>(null);
  // Новый swipe-жест начат (pointerdown) — handoff доводки делает первый move.
  const swipeGestureNewRef = useRef(false);
  // Базовый offset жеста (offset на первый move + пройденная за активацию доля).
  const baseOffsetRef = useRef(0);
  const settleRafRef = useRef<number | null>(null);

  const currentTab: TabRoot = SCREEN_TAB[currentScreen] ?? 'main';
  const currentSlot = TAB_ORDER.indexOf(currentTab);
  const scrubEnabled = SWIPE_SCREENS.includes(currentScreen);

  // Завершение доводки: сменить РАЗДЕЛ (seam-мгновенно) и снять strip. Смена только
  // при смене tab — откат/доводка внутри своего раздела экран не меняет (под-экран
  // main-more при откате остаётся собой).
  const finishSettle = useCallback(
    (target: number) => {
      const tab = TAB_ORDER[target];
      if (tab && tab !== (SCREEN_TAB[currentScreen] ?? 'main')) {
        setSeamNav(true);
        switchTab(tab);
      }
      setScrubOffset(null);
      scrubSourceRef.current = null;
    },
    [currentScreen, setScrubOffset, switchTab]
  );

  // Доводка offset → target: ease-out-cubic; длительность масштабируется от пути
  // (≥ SCRUB_SETTLE_MS; при D ≥ dist(px) пик ≤ 3px/мс — без кадров |Δx| > 50px).
  const settleTo = useCallback(
    (target: number) => {
      if (settleRafRef.current !== null) {
        cancelAnimationFrame(settleRafRef.current);
        settleRafRef.current = null;
      }
      const from = scrubOffsetRef.current ?? target;
      if (Math.abs(target - from) < 1e-4 || prefersReducedMotion) {
        setScrubOffset(target);
        finishSettle(target);
        return;
      }
      const t0 = performance.now();
      const duration = Math.max(SCRUB_SETTLE_MS, Math.abs(target - from) * window.innerWidth);
      const step = (now: number) => {
        const k = Math.min((now - t0) / duration, 1);
        const eased = 1 - (1 - k) ** 3;
        setScrubOffset(from + (target - from) * eased);
        if (k < 1) {
          settleRafRef.current = requestAnimationFrame(step);
          return;
        }
        settleRafRef.current = null;
        finishSettle(target);
      };
      settleRafRef.current = requestAnimationFrame(step);
    },
    [finishSettle, prefersReducedMotion, setScrubOffset]
  );

  // Выбор цели по отпусканию пальца: ближайший раздел, но флик (скорость сверх
  // порога) перекидывает на следующий в сторону скорости даже при малом пути (DoD #422).
  const settleFromRelease = useCallback(
    (velocityOffsetPerMs: number, cancelled: boolean) => {
      const off = scrubOffsetRef.current;
      if (off === null) {
        scrubSourceRef.current = null;
        return;
      }
      let target = Math.round(off);
      if (!cancelled) {
        const commitV = 0.5 / window.innerWidth; // 0.5 px/мс — порог флика
        if (Math.abs(velocityOffsetPerMs) > commitV) {
          target = velocityOffsetPerMs > 0 ? Math.ceil(off - 1e-3) : Math.floor(off + 1e-3);
        }
      }
      settleTo(Math.min(2, Math.max(0, target)));
    },
    [settleTo]
  );

  // Останов rAF-доводки на размонтировании.
  useEffect(
    () => () => {
      if (settleRafRef.current !== null) cancelAnimationFrame(settleRafRef.current);
    },
    []
  );

  // seamNav гасим через кадр после мгновенного enter целевого экрана — чтобы
  // последующие tap-переходы снова анимировались обычным слайдом.
  useEffect(() => {
    if (!seamNav) return;
    const r = requestAnimationFrame(() => setSeamNav(false));
    return () => cancelAnimationFrame(r);
  }, [seamNav]);

  // Источник «палец по экрану» (useTabSwipe). onGestureStart лишь метит новый жест;
  // handoff (перехват доводки + базовый offset) делает первый активированный move —
  // тап идущую доводку не срывает.
  const handleSwipeGestureStart = useCallback(() => {
    if (scrubSourceRef.current === 'caret') return;
    swipeGestureNewRef.current = true;
  }, []);
  const handleSwipeScrubMove = useCallback(
    (dxFraction: number) => {
      if (scrubSourceRef.current === 'caret') return;
      if (swipeGestureNewRef.current) {
        swipeGestureNewRef.current = false;
        if (settleRafRef.current !== null) {
          cancelAnimationFrame(settleRafRef.current);
          settleRafRef.current = null;
        }
        const cur = scrubOffsetRef.current;
        if (cur === null) scrubOriginScreenRef.current = currentScreen;
        // base так, что offset на этот первый move == текущий (без скачка активации).
        baseOffsetRef.current = (cur ?? currentSlot) + dxFraction;
        scrubSourceRef.current = 'swipe';
      }
      setScrubOffset(Math.min(2, Math.max(0, baseOffsetRef.current - dxFraction)));
    },
    [currentScreen, currentSlot, setScrubOffset]
  );
  const handleSwipeScrubEnd = useCallback(
    ({ velocityFraction, cancelled }: { velocityFraction: number; cancelled: boolean }) => {
      if (scrubSourceRef.current !== 'swipe') return;
      // offset = base − dxFraction ⇒ d(offset)/dt = −velocityFraction.
      settleFromRelease(-velocityFraction, cancelled);
    },
    [settleFromRelease]
  );

  // Свайп между разделами карусели: touch-only pointer-жест на обёртке
  // screenTransition; на flow/auth-экранах и на карточках уведомлений не активен.
  const tabSwipeHandlers = useTabSwipe({
    currentScreen,
    onGestureStart: handleSwipeGestureStart,
    onScrubMove: handleSwipeScrubMove,
    onScrubEnd: handleSwipeScrubEnd,
  });

  // Источник «drag каретки» (FloatingNav): абсолютная дробная позиция в слотах
  // (0 — колокол, 1 — Поездки, 2 — Профиль) прямо в offset.
  const lastCaretFractionRef = useRef(currentSlot);
  const handleCaretScrub = useCallback(
    (fraction: number) => {
      if (scrubSourceRef.current === 'swipe') return;
      if (scrubSourceRef.current !== 'caret') {
        if (settleRafRef.current !== null) {
          cancelAnimationFrame(settleRafRef.current);
          settleRafRef.current = null;
        }
        if (scrubOffsetRef.current === null) scrubOriginScreenRef.current = currentScreen;
        scrubSourceRef.current = 'caret';
      }
      lastCaretFractionRef.current = fraction;
      setScrubOffset(Math.min(2, Math.max(0, fraction)));
    },
    [currentScreen, setScrubOffset]
  );
  const handleCaretScrubEnd = useCallback(
    (cancelled: boolean) => {
      if (scrubSourceRef.current !== 'caret') return;
      if (scrubOffsetRef.current === null) {
        scrubSourceRef.current = null;
        return;
      }
      const target = cancelled ? currentSlot : Math.round(Math.min(2, Math.max(0, lastCaretFractionRef.current)));
      settleTo(target);
    },
    [currentSlot, settleTo]
  );

  // Каретка ↔ скраб: FloatingNav получает тот же непрерывный offset (слот == индекс
  // раздела); в собственном drag каретки FloatingNav игнорирует scrubOffset (dragX главнее).

  // Strip живого скраба (issue #422): ПОВЕРХ карусели, без AnimatePresence — до двух
  // соседних экранов, каждый на translateX (i − offset)·100%. Keyed-экран под strip
  // скрыт (visibility), НЕ размонтирован. Панель раздела-origin рендерит фактический
  // экран старта (в т.ч. под-экран), соседи — корневые (их маунт-фетчи дедупят кэши #414).
  const scrubLayer =
    scrubOffset != null
      ? (() => {
          const origin = scrubOriginScreenRef.current ?? currentScreen;
          const originIdx = TAB_ORDER.indexOf(SCREEN_TAB[origin] ?? 'main');
          const lo = Math.max(0, Math.floor(scrubOffset));
          const hi = Math.min(2, Math.ceil(scrubOffset));
          const indices = lo === hi ? [lo] : [lo, hi];
          const paneStyle = (screen: Screen, translatePct: number): CSSProperties => ({
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            inset: 0,
            paddingBottom:
              NAV_VISIBLE_SCREENS.includes(screen) && !isDesktop
                ? FLOATING_NAV_CONTENT_PADDING
                : 'env(safe-area-inset-bottom)',
            transform: `translateX(${translatePct}%)`,
            background: 'var(--background)',
          });
          return (
            <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 5, overflow: 'hidden', pointerEvents: 'none' }}>
              {indices.map((i) => {
                const screen = i === originIdx ? origin : TAB_ROOT_SCREEN[TAB_ORDER[i]];
                return (
                  <div key={i} style={paneStyle(screen, (i - scrubOffset) * 100)}>
                    <ErrorBoundary resetKey={screen}>
                      <Suspense fallback={<ScreenSkeleton />}>
                        {screenRegistry[screen]?.(screenCtx)}
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                );
              })}
            </div>
          );
        })()
      : null;

  // Смена экрана (AnimatePresence + направленный слайд) — общая для мобиля и десктопа,
  // различается только внешняя обвязка (сайдбар-строка vs мобильная колонка), поэтому
  // вынесена в переменную, а не задублирована в обеих ветках раскладки ниже.
  const screenTransition = (
    <AnimatePresence initial={false} custom={{ dir: direction, tab: isTabTransition, seam: seamNav }}>
      <motion.div
        key={currentScreen}
        custom={{ dir: direction, tab: isTabTransition, seam: seamNav }}
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
          // Во время скраба keyed-экран скрыт (слой поверх показывает его копию
          // в позиции пальца), но НЕ размонтирован — состояние живо.
          visibility: scrubOffset != null ? 'hidden' : undefined,
        }}
      >
        <ErrorBoundary resetKey={currentScreen}>
        <Suspense fallback={<ScreenSkeleton />}>
        {screenRegistry[currentScreen]?.(screenCtx)}
        </Suspense>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );

  return (
    <ProfileProvider>
      <AppCacheWarmer />
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
        {isDesktop ? (
          // Десктоп (≥900px, issue #379): постоянный левый сайдбар (264px, лого «ЯРайд»)
          // вместо топбара DesktopNav (#365) + контент справа. Сайдбар сам скрывается на
          // flow-экранах (isNavVisibleForScreen) — тогда контент занимает всю ширину
          // строки один-в-один как раньше (без сайдбара).
          <div
            style={{
              height: '100dvh',
              display: 'flex',
              flexDirection: 'row',
              paddingTop: 'env(safe-area-inset-top)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
              overflowX: 'clip',
            }}
          >
            <DesktopSidebar
              currentScreen={currentScreen}
              onNavigate={(root) => resetTo(root === 'profile' ? 'profile' : 'main')}
              onNotificationsClick={() => navigate('notifications')}
              onPublish={() => navigate('driver-publish')}
            />
            <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  maxWidth: `${DESKTOP_MAX_PX}px`,
                  margin: '0 auto',
                  height: '100%',
                  position: 'relative',
                  color: 'var(--foreground)',
                }}
              >
                {screenTransition}
              </div>
            </div>
          </div>
        ) : (
          // Мобиль/Telegram (<900px) — прежняя колонка без изменений (issue #379 её не трогает).
          <div
            style={{
              maxWidth: `${MOBILE_COLUMN_PX}px`,
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
            {/* touchAction: 'pan-y' — иначе браузер начинает нативный горизонтальный пан
                и шлёт pointercancel до pointerup, сбрасывая tab-свайп (issue #415).
                Вертикальный скролл сохраняется; drag-удаление карточек имеет свой pan-y. */}
            <div style={{ position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'pan-y' }} {...tabSwipeHandlers}>
              {screenTransition}
              {scrubLayer}
            </div>
          </div>
        )}
        {!isDesktop && (
          <FloatingNav
            currentScreen={currentScreen}
            onNavigate={(root) => switchTab(root === 'profile' ? 'profile' : 'main')}
            onNotificationsClick={() => switchTab('notifications')}
            scrubOffset={scrubOffset}
            onCaretScrub={scrubEnabled ? handleCaretScrub : undefined}
            onCaretScrubEnd={scrubEnabled ? handleCaretScrubEnd : undefined}
          />
        )}
      </div>
    </ProfileProvider>
  );
}

export default App;
