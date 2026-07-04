import { cancelAlert } from '../lib/api';
import type { NavigateFn } from '../lib/screenRegistry';

interface UseAlertHandlersArgs {
  alertId: number | null;
  navigate: NavigateFn;
}

/**
 * Отмена заявки-алерта с RequestPublishedScreen (issue #319).
 *
 * alertId приходит из общего слота навигации publishedTripId: PassengerRequestScreen
 * прокидывает id созданной заявки (ответ POST /api/alerts) через navigate() при
 * переходе на 'request-published' — тот же механизм, что уже использует
 * BookingConfirmedScreen для «последнего опубликованного id».
 *
 * Ошибку API намеренно НЕ глотаем: RequestPublishedScreen.handleCancel (issue #317)
 * сам оборачивает вызов в try/catch и показывает cancelError при отказе. При успехе
 * решаем сами, куда уводить пользователя — на main.
 */
export function useAlertHandlers({ alertId, navigate }: UseAlertHandlersArgs) {
  const handleCancelAlert = async () => {
    if (alertId === null) {
      // Заявки в состоянии навигации нет (например, прямой заход на экран) —
      // отменять на сервере нечего, просто уходим на main.
      navigate('main');
      return;
    }
    await cancelAlert(alertId);
    navigate('main');
  };

  return { handleCancelAlert };
}
