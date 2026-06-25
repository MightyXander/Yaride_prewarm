import { useState, useCallback, useEffect } from 'react';
import type { Screen, Trip, ConfirmKind, NavigationState } from '../types/navigation';

// Куда возвращает BackButton с каждого экрана
const PARENT_SCREEN: Record<Screen, Screen> = {
  intro: 'intro',
  main: 'intro',
  'main-more': 'main',
  'trip-details': 'main',
  'empty-state': 'main',
  'booking-profile': 'trip-details',
  'driver-publish': 'main',
  'booking-confirmed': 'main',
  profile: 'main',
  'driver-bookings': 'booking-confirmed',
  'become-driver': 'profile',
  'license-review': 'become-driver',
  'in-trip': 'booking-confirmed',
  safety: 'profile',
};

export const useNavigation = (initialScreen: Screen = 'intro') => {
  const [navState, setNavState] = useState<NavigationState>({
    currentScreen: initialScreen,
    selectedTrip: null,
    confirmKind: 'booking',
    scrollPositions: {
      intro: 0,
      main: 0,
      'main-more': 0,
      'trip-details': 0,
      'empty-state': 0,
      'booking-profile': 0,
      'driver-publish': 0,
      'booking-confirmed': 0,
      profile: 0,
      'driver-bookings': 0,
      'become-driver': 0,
      'license-review': 0,
      'in-trip': 0,
      safety: 0,
    },
  });

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
    (screen: Screen, trip: Trip | null = null, confirmKind?: ConfirmKind) => {
      // Save current scroll position
      const currentPosition = window.scrollY;
      saveScrollPosition(navState.currentScreen, currentPosition);

      setNavState((prev) => ({
        ...prev,
        currentScreen: screen,
        // Поездку сохраняем, если передали; иначе оставляем выбранную ранее
        selectedTrip: trip !== null ? trip : prev.selectedTrip,
        confirmKind: confirmKind ?? prev.confirmKind,
      }));

      // Scroll to top for new screen
      window.scrollTo(0, 0);
    },
    [navState.currentScreen, saveScrollPosition]
  );

  // Go back to previous screen
  const goBack = useCallback(() => {
    const { currentScreen, scrollPositions } = navState;
    const previousScreen: Screen = PARENT_SCREEN[currentScreen] ?? 'main';

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

  return {
    currentScreen: navState.currentScreen,
    selectedTrip: navState.selectedTrip,
    confirmKind: navState.confirmKind,
    navigate,
    goBack,
  };
};
