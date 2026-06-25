import { useState, useCallback, useEffect } from 'react';
import type { Screen, Trip, NavigationState } from '../types/navigation';

export const useNavigation = (initialScreen: Screen = 'intro') => {
  const [navState, setNavState] = useState<NavigationState>({
    currentScreen: initialScreen,
    selectedTrip: null,
    scrollPositions: {
      intro: 0,
      main: 0,
      'trip-details': 0,
      'empty-state': 0,
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
    (screen: Screen, trip: Trip | null = null) => {
      // Save current scroll position
      const currentPosition = window.scrollY;
      saveScrollPosition(navState.currentScreen, currentPosition);

      setNavState((prev) => ({
        ...prev,
        currentScreen: screen,
        selectedTrip: trip,
      }));

      // Scroll to top for new screen
      window.scrollTo(0, 0);
    },
    [navState.currentScreen, saveScrollPosition]
  );

  // Go back to previous screen
  const goBack = useCallback(() => {
    const { currentScreen, scrollPositions } = navState;

    let previousScreen: Screen = 'main';
    if (currentScreen === 'trip-details' || currentScreen === 'empty-state') {
      previousScreen = 'main';
    } else if (currentScreen === 'main') {
      previousScreen = 'intro';
    }

    setNavState((prev) => ({
      ...prev,
      currentScreen: previousScreen,
      selectedTrip: null,
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
    navigate,
    goBack,
  };
};
