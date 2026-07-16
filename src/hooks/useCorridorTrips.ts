import { useCallback, useEffect, useRef } from 'react';
import { useAsync } from './useAsync';
import { useRefetchOnFocus, usePollingRefetch } from './useRefetchOnFocus';
import { getRoutePoints, getTrips } from '../lib/api';
import { mapTripListItemToTrip } from '../lib/mappers';
import type { Screen } from '../types/navigation';

// Экраны-коридоры (списки поездок) — где обновление списка имеет смысл.
const CORRIDOR_SCREENS: Screen[] = ['main', 'main-more', 'evening-main'];

/**
 * Данные коридора Брагино↔Центр (точки маршрута + списки поездок morning/evening)
 * и их авто-обновление (issue #258 «данные протухают»): при возврате фокуса/видимости
 * вкладки, при входе на экран-коридор и лёгким периодическим рефетчем, пока он открыт.
 * Списки живут на уровне App (не размонтируются при навигации между экранами) —
 * поэтому после публикации/брони/отмены их нужно освежать явно. Вынесено из App.tsx (#290).
 */
export function useCorridorTrips(currentScreen: Screen, selectedDate: string) {
  // Загрузка точек маршрута для определения ID Брагино и Центра
  const routePointsState = useAsync(() => getRoutePoints(), []);

  // Находим ID точек Брагино и Центр
  const braginoId = routePointsState.status === 'success'
    ? routePointsState.data.points.find((p) => p.title.includes('Брагино'))?.id
    : undefined;
  const centrId = routePointsState.status === 'success'
    ? routePointsState.data.points.find((p) => p.title.includes('Центр'))?.id
    : undefined;

  // Загрузка поездок Брагино → Центр (morning/«в центр») за выбранную дату.
  const morningTripsState = useAsync(
    () => {
      if (!braginoId || !centrId) return Promise.resolve([]);
      return getTrips({ corridor: `${braginoId}-${centrId}`, date: selectedDate }).then((res) => res.trips.map(mapTripListItemToTrip));
    },
    [braginoId, centrId, selectedDate]
  );

  // Загрузка поездок Центр → Брагино (evening/«из центра») за выбранную дату.
  const eveningTripsState = useAsync(
    () => {
      if (!braginoId || !centrId) return Promise.resolve([]);
      return getTrips({ corridor: `${centrId}-${braginoId}`, date: selectedDate }).then((res) => res.trips.map(mapTripListItemToTrip));
    },
    [braginoId, centrId, selectedDate]
  );

  const morningTrips = morningTripsState.status === 'success' ? morningTripsState.data : [];
  const eveningTrips = eveningTripsState.status === 'success' ? eveningTripsState.data : [];

  const refetchCorridor = useCallback(() => {
    // Тихий рефетч (refetch): без скелета поверх уже показанного списка.
    morningTripsState.refetch();
    eveningTripsState.refetch();
    // refetch стабильна по [braginoId, centrId]; пересоздаётся только при их смене.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morningTripsState.refetch, eveningTripsState.refetch]);

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

  return { routePointsState, morningTripsState, eveningTripsState, morningTrips, eveningTrips };
}
