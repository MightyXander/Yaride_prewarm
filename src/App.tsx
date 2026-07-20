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
import { localDateStr } from './lib/dateLocal';
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

// Окно усреднения скорости флика каретки навбара (мс) — как у свайпа (useTabSwipe).
const CARET_VELOCITY_WINDOW_MS = 100;

// Pinned-watchdog (#437, #440): период одной проверки и максимум повторных ожиданий,
// пока отложенный (startTransition) currentScreen догоняет target. ~5×400мс ≈ 2с
// на медленный/голодающий рендер, затем — жёсткий ресинк (форс перехода на target,
// БЕЗ отката к origin), см. armPinnedWatchdog.
const PINNED_WATCHDOG_MS = 400;
const PINNED_WATCHDOG_MAX_REARMS = 5;

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
  // Дата поиска поездок на главном экране (issue #441): 'YYYY-MM-DD', по умолчанию сегодня.
  const [selectedDate, setSelectedDate] = useState<string>(() => localDateStr());
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

  const {
    routePointsState,
    morningTripsState,
    eveningTripsState,
    morningTrips,
    eveningTrips,
    morningFirstLoading,
    eveningFirstLoading,
    morningFirstError,
    eveningFirstError,
  } = useCorridorTrips(currentScreen, selectedDate, mainDirection);

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
    selectedDate,
    setSelectedDate,
    morningTrips,
    eveningTrips,
    morningTripsState,
    eveningTripsState,
    morningFirstLoading,
    eveningFirstLoading,
    morningFirstError,
    eveningFirstError,
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
  const scrubOffsetRef = useRef<number | null>(null);
  // scrubActive — идёт ли скраб (монтаж strip + скрытие keyed-экрана). Непрерывная
  // ПОЗИЦИЯ (scrubOffsetRef) гоняется в DOM через refs — БЕЗ setState на кадр: раньше
  // каждый кадр пере-рендерил тяжёлые деревья экранов (jank на iOS/WKWebView, ~24fps
  // под нагрузкой). React-рендер теперь только на СТАРТ (монтаж strip) и ФИНИШ жеста.
  const [scrubActive, setScrubActiveState] = useState(false);
  const scrubActiveRef = useRef(false);
  // Панели strip (по слоту 0..2) и императивный драйвер каретки навбара — пишем им
  // transform напрямую, минуя React.
  const paneRefs = useRef<Array<HTMLDivElement | null>>([]);
  const caretDriveRef = useRef<((slot: number | null) => void) | null>(null);
  // Запись позиции скраба в DOM без ре-рендера: strip-панели + каретка навбара.
  const applyScrubDom = useCallback((off: number) => {
    scrubOffsetRef.current = off;
    const panes = paneRefs.current;
    for (const p of panes) {
      if (!p) continue;
      p.style.transform = `translateX(${(Number(p.dataset.slot) - off) * 100}%)`;
    }
    caretDriveRef.current?.(off);
  }, []);
  // Совместимый со ВСЕЙ pin/watchdog-логикой (#437/#440) сеттер: число — позиция (актив
  // + запись в DOM; setState лишь на первом кадре жеста, дальше только refs); null —
  // снять strip и отпустить каретку в settled. Точки вызова pin/watchdog не меняются.
  const setScrubOffset = useCallback(
    (v: number | null) => {
      if (v === null) {
        scrubOffsetRef.current = null;
        caretDriveRef.current?.(null);
        if (scrubActiveRef.current) {
          scrubActiveRef.current = false;
          setScrubActiveState(false);
        }
        return;
      }
      if (!scrubActiveRef.current) {
        scrubActiveRef.current = true;
        setScrubActiveState(true);
      }
      applyScrubDom(v);
    },
    [applyScrubDom]
  );
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
  // Pinned-доводка (issue #437): target-слот, к которому приколот scrubOffset,
  // пока ждём отложенный (startTransition) переход currentScreen на новый tab.
  // null — pinned-режима нет.
  const pinnedTargetRef = useRef<number | null>(null);
  // Watchdog pinned-режима: страховка на случай, если currentScreen не догонит
  // target (см. clearPinned/watchdog ниже).
  const pinnedWatchdogRef = useRef<number | null>(null);
  // Актуальный currentSlot для отложенного watchdog (замыкание finishSettle держит
  // устаревший): watchdog по нему отличает «currentScreen догнал target» (collapse)
  // от «ещё не догнал» (медленный startTransition) — см. finishSettle ниже (#440).
  const currentSlotRef = useRef(0);
  const clearPinned = useCallback(() => {
    pinnedTargetRef.current = null;
    if (pinnedWatchdogRef.current !== null) {
      window.clearTimeout(pinnedWatchdogRef.current);
      pinnedWatchdogRef.current = null;
    }
  }, []);

  const currentTab: TabRoot = SCREEN_TAB[currentScreen] ?? 'main';
  const currentSlot = TAB_ORDER.indexOf(currentTab);
  const scrubEnabled = SWIPE_SCREENS.includes(currentScreen);
  // Зеркало последнего currentSlot для отложенного watchdog (его замыкание держит
  // устаревший currentScreen). Пишем в рендере — идемпотентно, всегда актуально.
  currentSlotRef.current = currentSlot;

  // Watchdog pinned-доводки (#437 + фикс #440). Пин живёт, пока отложенный
  // (startTransition) currentScreen догоняет target. Инвариант: сброс scrubOffset в
  // null ДОПУСТИМ только когда keyed-экран УЖЕ целевой, иначе показался бы устаревший
  // origin — карусель отскочит к origin и прыгнет к target («пружинит и возвращается»,
  // #440). Пока currentScreen не догнал — ЖДЁМ (re-arm), НЕ сбрасывая offset. Чтобы не
  // залипнуть навечно, если переход реально потерян (switchTab схлопнулся / starvation),
  // после PINNED_WATCHDOG_MAX_REARMS делаем жёсткий ресинк: повторяем switchTab и
  // держим offset на target (НЕ откат к origin), currentSlot-эффект добьёт до null.
  const armPinnedWatchdog = useCallback(
    (target: number, attempt: number) => {
      if (pinnedWatchdogRef.current !== null) window.clearTimeout(pinnedWatchdogRef.current);
      pinnedWatchdogRef.current = window.setTimeout(() => {
        pinnedWatchdogRef.current = null;
        // Пин уже снят currentSlot-эффектом (currentScreen пришёл или ушёл) — готово.
        if (pinnedTargetRef.current === null) return;
        if (currentSlotRef.current === target) {
          // currentScreen догнал target, а currentSlot-эффект по какой-то причине не
          // сработал — гасить offset безопасно (keyed-экран уже целевой).
          pinnedTargetRef.current = null;
          setScrubOffset(null);
          return;
        }
        if (attempt < PINNED_WATCHDOG_MAX_REARMS) {
          // currentScreen ещё НЕ догнал (медленный/голодающий startTransition) — ждём
          // дальше, offset остаётся приколот к target (scrubLayer показывает target),
          // никакого отката к origin.
          armPinnedWatchdog(target, attempt + 1);
          return;
        }
        // Потолок ожидания: переход, похоже, потерян. Жёсткий ресинк — повторяем
        // switchTab и оставляем offset на target (показываем целевой раздел, НЕ origin).
        // Пин держим: currentSlot-эффект снимет scrubOffset→null, когда currentScreen
        // наконец придёт; если так и не придёт — карусель остаётся на target (не залипает
        // на устаревшем origin), а следующий жест/тап штатно снимет пин.
        switchTab(TAB_ORDER[target]);
        setScrubOffset(target);
      }, PINNED_WATCHDOG_MS);
    },
    [setScrubOffset, switchTab]
  );

  // Завершение доводки: сменить РАЗДЕЛ (seam-мгновенно) и снять strip. Смена только
  // при смене tab — откат/доводка внутри своего раздела экран не меняет (под-экран
  // main-more при откате остаётся собой).
  //
  // issue #437: при смене tab scrubOffset НЕ гасится синхронно — switchTab меняет
  // currentScreen отложенно (startTransition в useNavigation), а finishSettle
  // синхронен. Между ними один кадр scrubOffset===null при старом currentScreen
  // включал transition в FloatingNav → каретка отскакивала к старой позиции и
  // затем ехала вперёд второй раз («пружина»). Вместо гашения — приколываем
  // offset к target (визуально каретка уже на месте) и ждём, пока currentScreen
  // догонит (эффект ниже снимает pin). Если tab не меняется (dir===0, switchTab
  // не вызывается) — currentScreen никогда не обновится, поэтому в этой ветке
  // scrubOffset гасим сразу же, иначе каретка залипнет навсегда.
  const finishSettle = useCallback(
    (target: number) => {
      const tab = TAB_ORDER[target];
      if (tab && tab !== (SCREEN_TAB[currentScreen] ?? 'main')) {
        setSeamNav(true);
        switchTab(tab);
        setScrubOffset(target);
        pinnedTargetRef.current = target;
        // Страховка от вечного пина (#437) БЕЗ отскока к origin (#440): watchdog ждёт
        // прихода currentScreen, а не гасит offset вслепую через фикс. интервал.
        armPinnedWatchdog(target, 0);
      } else {
        setScrubOffset(null);
      }
      scrubSourceRef.current = null;
    },
    [armPinnedWatchdog, currentScreen, setScrubOffset, switchTab]
  );

  // Снятие pin. Инвариант: pinned-состояние живёт РОВНО пока идёт доводка того
  // жеста, который его завёл, — т.е. пока ожидается приход currentScreen именно на
  // pinnedTarget. Два пути снятия:
  //  1) currentScreen догнал pinned target — штатно возвращаем scrubOffset в null
  //     (settled-режим), каретка не сдвинется (позиция та же);
  //  2) currentScreen уехал КУДА-ТО ЕЩЁ (тап по табу/колоколу, goBack, навигация из
  //     экрана — всё мимо жеста): pin устарел, его target больше никогда не наступит.
  //     Держать scrubOffset прикопленным к нему нельзя — scrubLayer до срабатывания
  //     watchdog (400мс) показывал бы поверх реального экрана чужой прикопленный.
  // Оба пути ведут к одному действию (снять pin + вернуть scrubOffset в null), поэтому
  // ветки не различаются: любое ИЗМЕНЕНИЕ currentSlot при активном pin означает, что
  // ожидание завершено — либо целью, либо чужой навигацией.
  useEffect(() => {
    if (pinnedTargetRef.current === null) return;
    clearPinned();
    setScrubOffset(null);
  }, [currentSlot, clearPinned, setScrubOffset]);

  // Прямая навигация по табам (тап по табу/колоколу навбара) — вне жеста. Если сейчас
  // идёт pinned-доводка ЧУЖОГО (предыдущего) жеста и её цель не совпадает с целью тапа,
  // pin устарел прямо в момент тапа: снимаем его синхронно, не дожидаясь, пока
  // startTransition доведёт currentScreen (иначе до 400мс виден не тот экран). Тап в ту
  // же цель, что и pin, — доводка продолжается, pin остаётся валиден (гасить его значило
  // бы вернуть «пружину» каретки из issue #437).
  const navigateToTab = useCallback(
    (tab: TabRoot) => {
      const target = TAB_ORDER.indexOf(tab);
      if (pinnedTargetRef.current !== null && pinnedTargetRef.current !== target) {
        clearPinned();
        setScrubOffset(null);
      }
      switchTab(tab);
    },
    [clearPinned, setScrubOffset, switchTab]
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

  // Останов rAF-доводки и watchdog pinned-режима на размонтировании.
  useEffect(
    () => () => {
      if (settleRafRef.current !== null) cancelAnimationFrame(settleRafRef.current);
      if (pinnedWatchdogRef.current !== null) window.clearTimeout(pinnedWatchdogRef.current);
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
        // Новый swipe перехватывает pinned-доводку (issue #437) — снимаем pin/watchdog,
        // иначе watchdog позже насильно сбросит scrubOffset посреди уже нового жеста.
        clearPinned();
        const cur = scrubOffsetRef.current;
        if (cur === null) scrubOriginScreenRef.current = currentScreen;
        // base так, что offset на этот первый move == текущий (без скачка активации).
        baseOffsetRef.current = (cur ?? currentSlot) + dxFraction;
        scrubSourceRef.current = 'swipe';
      }
      setScrubOffset(Math.min(2, Math.max(0, baseOffsetRef.current - dxFraction)));
    },
    [currentScreen, currentSlot, clearPinned, setScrubOffset]
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
  // Окно скорости флика каретки (как у свайпа) — быстрый флик перекидывает на следующий
  // слот даже при коротком пути (иначе Math.round «отскакивал» короткий быстрый флик назад).
  const caretSamplesRef = useRef<Array<{ f: number; t: number }>>([]);
  const handleCaretScrub = useCallback(
    (fraction: number) => {
      if (scrubSourceRef.current === 'swipe') return;
      if (scrubSourceRef.current !== 'caret') {
        if (settleRafRef.current !== null) {
          cancelAnimationFrame(settleRafRef.current);
          settleRafRef.current = null;
        }
        // Новый drag каретки перехватывает pinned-доводку (issue #437): снимаем
        // pin/watchdog — иначе watchdog позже насильно сбросит offset посреди уже
        // нового жеста. FloatingNav стартует drag от текущей визуальной позиции, скачка нет.
        if (scrubOffsetRef.current === null) scrubOriginScreenRef.current = currentScreen;
        clearPinned();
        caretSamplesRef.current = [];
        scrubSourceRef.current = 'caret';
      }
      lastCaretFractionRef.current = fraction;
      const now = performance.now();
      const samples = caretSamplesRef.current;
      samples.push({ f: fraction, t: now });
      while (samples.length > 1 && now - samples[0].t > CARET_VELOCITY_WINDOW_MS) samples.shift();
      setScrubOffset(Math.min(2, Math.max(0, fraction)));
    },
    [currentScreen, clearPinned, setScrubOffset]
  );
  const handleCaretScrubEnd = useCallback(
    (cancelled: boolean) => {
      if (scrubSourceRef.current !== 'caret') return;
      if (scrubOffsetRef.current === null) {
        scrubSourceRef.current = null;
        return;
      }
      const samples = caretSamplesRef.current;
      caretSamplesRef.current = [];
      if (cancelled) {
        // Cancelled-жест (Telegram отобрал pointer, issue #439) доводим ВПЕРЁД к
        // ближайшему слоту от последней известной позиции (не откат к currentSlot);
        // фолбэк на currentSlot — только если позиция не finite.
        const known = Number.isFinite(lastCaretFractionRef.current);
        const target = known
          ? Math.round(Math.min(2, Math.max(0, lastCaretFractionRef.current)))
          : currentSlot;
        settleTo(target);
        return;
      }
      // Обычное отпускание: скорость флика по окну перекидывает на следующий слот даже
      // при коротком пути (иначе Math.round «отскакивал» короткий быстрый флик назад).
      let v = 0;
      if (samples.length > 1) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const span = last.t - first.t;
        if (span > 0) v = (last.f - first.f) / span; // слот/мс, + к профилю (вперёд по offset)
      }
      settleFromRelease(v, false);
    },
    [currentSlot, settleTo, settleFromRelease]
  );

  // Каретка ↔ скраб: FloatingNav получает тот же непрерывный offset (слот == индекс
  // раздела); в собственном drag каретки FloatingNav игнорирует scrubOffset (dragX главнее).

  // Strip живого скраба (issue #422): ПОВЕРХ карусели, 3 панели-раздела на translateX
  // (i − offset)·100%; позиция гоняется через refs (paneRefs) без ре-рендера. Keyed-экран
  // под strip скрыт (visibility), НЕ размонтирован. Панель раздела-origin рендерит
  // фактический экран старта (в т.ч. под-экран), соседи — корневые (их фетчи дедупят #414).
  const scrubLayer = scrubActive
    ? (() => {
        const off = scrubOffsetRef.current ?? currentSlot;
        const origin = scrubOriginScreenRef.current ?? currentScreen;
        const originIdx = TAB_ORDER.indexOf(SCREEN_TAB[origin] ?? 'main');
        const paneStyle = (screen: Screen, i: number): CSSProperties => ({
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          inset: 0,
          paddingBottom:
            NAV_VISIBLE_SCREENS.includes(screen) && !isDesktop
              ? FLOATING_NAV_CONTENT_PADDING
              : 'env(safe-area-inset-bottom)',
          transform: `translateX(${(i - off) * 100}%)`,
          background: 'var(--background)',
          willChange: 'transform',
        });
        return (
          <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 5, overflow: 'hidden', pointerEvents: 'none' }}>
            {[0, 1, 2].map((i) => {
              const screen = i === originIdx ? origin : TAB_ROOT_SCREEN[TAB_ORDER[i]];
              return (
                <div
                  key={i}
                  data-slot={i}
                  ref={(el) => {
                    paneRefs.current[i] = el;
                  }}
                  style={paneStyle(screen, i)}
                >
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
          visibility: scrubActive ? 'hidden' : undefined,
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
            onNavigate={(root) => navigateToTab(root === 'profile' ? 'profile' : 'main')}
            onNotificationsClick={() => navigateToTab('notifications')}
            scrubActive={scrubActive}
            caretDriveRef={caretDriveRef}
            onCaretScrub={scrubEnabled ? handleCaretScrub : undefined}
            onCaretScrubEnd={scrubEnabled ? handleCaretScrubEnd : undefined}
          />
        )}
      </div>
    </ProfileProvider>
  );
}

export default App;
