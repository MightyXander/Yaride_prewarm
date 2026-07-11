import { useState, useCallback, useEffect, useRef } from 'react';
import type { Screen, Trip, ConfirmKind, NavigationState, RatingContext } from '../types/navigation';
import { saveLastScreen, touchLastScreen, resolvePersistedEntry } from '../lib/lastScreen';

// Heartbeat-интервал перезаписи ts у сохранённой записи (issue #402): без него
// reload после долгого «стояния» на одном экране (без навигации) не попадал бы
// во freshness-окно loadLastScreen — запись стухла бы, хотя это тот же reload.
const HEARTBEAT_INTERVAL_MS = 10_000;

// Фолбэк для goBack, когда стек истории пуст (напр. вход по deep-link — предыдущего экрана нет);
// также используется lastScreen.ts, чтобы найти ближайший восстановимый экран (issue #392).
export const PARENT_SCREEN: Record<Screen, Screen> = {
  'auth-gate': 'auth-gate',
  login: 'auth-gate',
  register: 'auth-gate',
  intro: 'intro',
  main: 'intro',
  'main-more': 'main',
  'trip-details': 'main',
  'empty-state': 'main',
  'booking-profile': 'trip-details',
  'driver-publish': 'main',
  'booking-confirmed': 'main',
  profile: 'main',
  'become-driver': 'profile',
  // «Назад» со статусного экрана ВУ ведёт в профиль (а не в форму ввода ВУ).
  // Повторная подача заявки — через явную кнопку «Отправить заново» (onRetry).
  'license-review': 'profile',
  safety: 'profile',
  'passenger-request': 'empty-state',
  'request-published': 'empty-state',
  'alert-push': 'main',
  'my-trips': 'profile',
  'rate-trip': 'my-trips',
  'evening-main': 'habit-home',
  'evening-publish': 'evening-main',
  'habit-home': 'profile',
  'user-profile': 'main',
  notifications: 'main',
  'my-cars': 'profile',
  'add-car': 'driver-publish',
  'my-alerts': 'profile',
};

// Максимальная глубина стека истории «назад».
const HISTORY_STACK_CAP = 20;

// Разделы «карусели» (issue #415): порядок слева направо, как в навбаре (bell — notifications — main — profile).
export type TabRoot = 'notifications' | 'main' | 'profile';
const TAB_ORDER: TabRoot[] = ['notifications', 'main', 'profile'];
// Какому разделу принадлежит экран (для вычисления направления карусели).
const SCREEN_TAB: Partial<Record<Screen, TabRoot>> = {
  notifications: 'notifications',
  main: 'main',
  'main-more': 'main',
  'evening-main': 'main',
  profile: 'profile',
  // Подстраницы раздела «Профиль» (FloatingNav на них виден): тап по табу
  // «Профиль» — тот же раздел (dir=0, обычный переход), по «Главной» —
  // карусель влево, как с корня профиля. Без этого фолбэк 'main' давал
  // обратное: свой раздел — карусель, чужой — микро-слайд.
  'my-trips': 'profile',
  'my-cars': 'profile',
  'my-alerts': 'profile',
  safety: 'profile',
};

export const useNavigation = (initialScreen: Screen = 'intro') => {
  // Направление последнего перехода: 1 — вперёд (navigate), -1 — назад (goBack).
  // Используется для направленных анимаций смены экрана.
  const [direction, setDirection] = useState<1 | -1>(1);
  // Флаг «переход между разделами» (issue #415): true — полноэкранный карусельный
  // слайд (switchTab), false — обычный микро-слайд (navigate/goBack и пр.).
  const [isTabTransition, setIsTabTransition] = useState(false);
  const [navState, setNavState] = useState<NavigationState>({
    currentScreen: initialScreen,
    selectedTrip: null,
    confirmKind: 'booking',
    ratingContext: null,
    publishedTripId: null,
    scrollPositions: {
      'auth-gate': 0,
      login: 0,
      register: 0,
      intro: 0,
      main: 0,
      'main-more': 0,
      'trip-details': 0,
      'empty-state': 0,
      'booking-profile': 0,
      'driver-publish': 0,
      'booking-confirmed': 0,
      profile: 0,
      'become-driver': 0,
      'license-review': 0,
      safety: 0,
      'passenger-request': 0,
      'request-published': 0,
      'alert-push': 0,
      'my-trips': 0,
      'rate-trip': 0,
      'evening-main': 0,
      'evening-publish': 0,
      'habit-home': 0,
      'user-profile': 0,
      notifications: 0,
      'my-cars': 0,
      'add-car': 0,
      'my-alerts': 0,
    },
  });

  // Настоящий стек истории переходов. В useRef, а не в state — сам по себе не
  // требует ре-рендера; читается/пишется синхронно внутри navigate/goBack.
  const historyStack = useRef<Screen[]>([]);

  // Положить экран на вершину стека, не дублируя подряд идущую запись.
  const pushHistory = (screen: Screen) => {
    const top = historyStack.current[historyStack.current.length - 1];
    if (screen === top) return;
    historyStack.current.push(screen);
    if (historyStack.current.length > HISTORY_STACK_CAP) {
      historyStack.current.shift();
    }
  };

  // Save scroll position before navigating away
  const saveScrollPosition = useCallback((screen: Screen, position: number) => {
    setNavState((prev) => ({
      ...prev,
      scrollPositions: {
        ...prev.scrollPositions,
        [screen]: position,
      },
    }));
  }, []);

  // Navigate to a screen
  const navigate = useCallback(
    (screen: Screen, trip: Trip | null = null, confirmKind?: ConfirmKind, publishedTripId?: number, backTo?: Screen) => {
      // Save current scroll position
      const currentPosition = window.scrollY;
      saveScrollPosition(navState.currentScreen, currentPosition);
      setDirection(1);
      setIsTabTransition(false);

      // В стек попадает то, куда должен вернуть «назад»: явный backTo, иначе
      // текущий экран (стандартный push истории).
      pushHistory(backTo ?? navState.currentScreen);

      setNavState((prev) => ({
        ...prev,
        currentScreen: screen,
        // Поездку сохраняем, если передали; иначе оставляем выбранную ранее
        selectedTrip: trip !== null ? trip : prev.selectedTrip,
        confirmKind: confirmKind ?? prev.confirmKind,
        publishedTripId: publishedTripId !== undefined ? publishedTripId : prev.publishedTripId,
      }));

      // Scroll to top for new screen
      window.scrollTo(0, 0);
    },
    [navState.currentScreen, saveScrollPosition]
  );

  // Переход «на корень» по клику на таб навбара: стек истории очищается —
  // таб в нативных приложениях сбрасывает накопленную глубину, а не пушит на неё.
  const resetTo = useCallback(
    (screen: Screen) => {
      const currentPosition = window.scrollY;
      saveScrollPosition(navState.currentScreen, currentPosition);
      setDirection(1);
      setIsTabTransition(false);

      historyStack.current = [];

      setNavState((prev) => ({
        ...prev,
        currentScreen: screen,
      }));

      window.scrollTo(0, 0);
    },
    [navState.currentScreen, saveScrollPosition]
  );

  // Navigate to rate-trip screen with rating context
  const navigateToRateTrip = useCallback(
    (ratingContext: RatingContext) => {
      const currentPosition = window.scrollY;
      saveScrollPosition(navState.currentScreen, currentPosition);
      setDirection(1);
      setIsTabTransition(false);

      pushHistory(navState.currentScreen);

      setNavState((prev) => ({
        ...prev,
        currentScreen: 'rate-trip',
        ratingContext,
      }));

      window.scrollTo(0, 0);
    },
    [navState.currentScreen, saveScrollPosition]
  );

  // Go back to previous screen
  const goBack = useCallback(() => {
    const { currentScreen, scrollPositions } = navState;
    const poppedScreen = historyStack.current.pop();
    // Пустой стек (вход по deep-link) — фолбэк на статичную родительскую мапу.
    const previousScreen: Screen = poppedScreen ?? PARENT_SCREEN[currentScreen] ?? 'main';
    setDirection(-1);
    setIsTabTransition(false);

    setNavState((prev) => ({
      ...prev,
      currentScreen: previousScreen,
    }));

    // Restore scroll position
    const savedPosition = scrollPositions[previousScreen] || 0;
    setTimeout(() => {
      window.scrollTo(0, savedPosition);
    }, 0);
  }, [navState]);

  // Переключение раздела «карусели» (issue #415): свайп по экрану или тап по табу
  // навбара. Направление — по позиции целевого раздела относительно текущего
  // в TAB_ORDER; переход помечается tab-флагом (полноэкранный слайд в App).
  // navigate/resetTo вызываются первыми, их setDirection(1)/setIsTabTransition(false)
  // перекрываются последующими сеттерами (React батчит, побеждает последняя запись).
  const switchTab = useCallback(
    (target: TabRoot) => {
      const currentTab = SCREEN_TAB[navState.currentScreen] ?? 'main';
      const dir = TAB_ORDER.indexOf(target) - TAB_ORDER.indexOf(currentTab);
      if (target === 'notifications') {
        navigate('notifications');
      } else {
        resetTo(target);
      }
      // Тот же раздел (напр. main-more → main) — обычный переход без карусели.
      if (dir === 0) return;
      setDirection(dir > 0 ? 1 : -1);
      setIsTabTransition(true);
    },
    [navState.currentScreen, navigate, resetTo]
  );

  // Restore scroll position when returning to a screen
  useEffect(() => {
    const savedPosition = navState.scrollPositions[navState.currentScreen] || 0;
    if (savedPosition > 0) {
      setTimeout(() => {
        window.scrollTo(0, savedPosition);
      }, 0);
    }
  }, [navState.currentScreen, navState.scrollPositions]);

  // Персистенс «последнего экрана» (issue #392, #402): одна точка записи покрывает
  // navigate/resetTo/goBack/navigateToRateTrip — все они меняют currentScreen.
  // Экраны вне whitelist приводятся к ближайшему восстановимому родителю.
  useEffect(() => {
    const entry = resolvePersistedEntry(navState.currentScreen, navState.selectedTrip?.id, PARENT_SCREEN);
    saveLastScreen(entry);
  }, [navState.currentScreen, navState.selectedTrip?.id]);

  // Heartbeat + pagehide/visibilitychange (issue #402): перезаписывают ts
  // сохранённой записи, не меняя её screen/tripId, чтобы reload после долгого
  // «стояния» на одном экране всё равно попадал в freshness-окно loadLastScreen.
  // Один эффект на весь хук (не привязан к currentScreen) — подписки живут
  // всё время жизни компонента и снимаются только на unmount.
  useEffect(() => {
    const intervalId = window.setInterval(touchLastScreen, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        touchLastScreen();
      }
    };
    const handlePageHide = () => {
      touchLastScreen();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  return {
    currentScreen: navState.currentScreen,
    selectedTrip: navState.selectedTrip,
    confirmKind: navState.confirmKind,
    ratingContext: navState.ratingContext,
    publishedTripId: navState.publishedTripId,
    direction,
    isTabTransition,
    navigate,
    navigateToRateTrip,
    goBack,
    resetTo,
    switchTab,
  };
};
