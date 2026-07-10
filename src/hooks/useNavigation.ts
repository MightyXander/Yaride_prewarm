import { useState, useCallback, useEffect, useRef } from 'react';
import type { Screen, Trip, ConfirmKind, NavigationState, RatingContext } from '../types/navigation';
import { saveLastScreen, resolvePersistedEntry } from '../lib/lastScreen';

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

export const useNavigation = (initialScreen: Screen = 'intro') => {
  // Направление последнего перехода: 1 — вперёд (navigate), -1 — назад (goBack).
  // Используется для направленных анимаций смены экрана.
  const [direction, setDirection] = useState<1 | -1>(1);
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

  // Restore scroll position when returning to a screen
  useEffect(() => {
    const savedPosition = navState.scrollPositions[navState.currentScreen] || 0;
    if (savedPosition > 0) {
      setTimeout(() => {
        window.scrollTo(0, savedPosition);
      }, 0);
    }
  }, [navState.currentScreen, navState.scrollPositions]);

  // Персистенс «последнего экрана» (issue #392): одна точка записи покрывает
  // navigate/resetTo/goBack/navigateToRateTrip — все они меняют currentScreen.
  // Экраны вне whitelist приводятся к ближайшему восстановимому родителю.
  useEffect(() => {
    const entry = resolvePersistedEntry(navState.currentScreen, navState.selectedTrip?.id, PARENT_SCREEN);
    saveLastScreen(entry);
  }, [navState.currentScreen, navState.selectedTrip?.id]);

  return {
    currentScreen: navState.currentScreen,
    selectedTrip: navState.selectedTrip,
    confirmKind: navState.confirmKind,
    ratingContext: navState.ratingContext,
    publishedTripId: navState.publishedTripId,
    direction,
    navigate,
    navigateToRateTrip,
    goBack,
    resetTo,
  };
};
