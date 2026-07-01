import { ApiException, cancelTrip, getTrip } from '../lib/api';
import { mapTripCardToTrip } from '../lib/mappers';
import { showToast } from '../lib/toast';
import type { NavigateFn, NavigateToRateTripFn } from '../lib/screenRegistry';
import type { NotificationType } from '../types/api';
import type { Screen, Trip } from '../types/navigation';

interface UseTripHandlersArgs {
  selectedTrip: Trip | null;
  navigate: NavigateFn;
  navigateToRateTrip: NavigateToRateTripFn;
}

/**
 * Хендлеры навигации/действий над конкретной поездкой: открытие деталей по ID
 * (деталей поездки/deep-link/уведомления), отмена своей поездки, маршрутизация
 * из уведомлений по типу. Вынесено из App.tsx (#290).
 */
export function useTripHandlers({ selectedTrip, navigate, navigateToRateTrip }: UseTripHandlersArgs) {
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

  return { handleOpenTripById, handleCancelOwnTrip, handleNotificationNavigate };
}
