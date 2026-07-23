import { useEffect, useRef } from 'react';
import type { Trip, Screen, ConfirmKind } from '../types/navigation';
import { getTrip } from '../lib/api';
import { mapTripCardToTrip } from '../lib/mappers';

/**
 * Источник start_param Telegram Mini App (initDataUnsafe либо URL query) —
 * вынесено из useEffect ниже, чтобы синхронно проверять наличие deep-link
 * ещё до монтирования (issue #392: deep-link приоритетнее восстановления
 * последнего экрана).
 */
const getStartParam = (): string | null => {
  // Источник 1: Telegram.WebApp.initDataUnsafe.start_param
  const tgStartParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (tgStartParam) return tgStartParam;

  // Источник 2: URL query parameter tgWebAppStartParam
  const urlParams = new URLSearchParams(window.location.search);
  const urlStartParam = urlParams.get('tgWebAppStartParam');
  if (urlStartParam) return urlStartParam;

  return null;
};

/** true — присутствует deep-link start_param (явное намерение сильнее восстановления). */
export const hasStartParam = (): boolean => getStartParam() !== null;

/**
 * Хук для обработки deep-link через start_param Telegram Mini App.
 * Схема start_param:
 * - 'trip-<id>' → открыть карточку поездки
 * - 'alert-<id>' → шеринг заявки пассажира наружу (виральная петля, CEO Council):
 *   отдельного экрана-детали заявки для водителя пока нет, поэтому ведём в главный
 *   коридор ('main'), где можно опубликовать поездку по подходящему маршруту.
 *   id заявки в самом параметре пока не используется — оставлен для будущего
 *   экрана-детали и для аналитики источника перехода.
 * - (будущие) 'bookings-<tripId>', 'my-trips'
 */
export const useStartParam = (
  navigate: (screen: Screen, trip?: Trip | null, confirmKind?: ConfirmKind, publishedTripId?: number) => void,
  onError?: (message: string) => void,
  /**
   * Включён ли deep-link (баг ревью #2): пока показан гейт авторизации, start_param
   * обрабатывать НЕЛЬЗЯ — иначе deep-link обошёл бы гейт. Когда гейт снят (enabled=true),
   * эффект перезапустится и обработает start_param один раз.
   */
  enabled = true
) => {
  const processed = useRef(false);

  useEffect(() => {
    // Пока deep-link выключен (показан гейт) — ничего не делаем, ждём enabled.
    if (!enabled) return;
    // Обрабатываем start_param только один раз
    if (processed.current) return;
    processed.current = true;

    const startParam = getStartParam();

    // Если start_param отсутствует или пустой — обычный старт (intro), без ошибок
    if (!startParam) return;

    // Парсинг start_param по префиксу (расширяемо)
    const handleStartParam = async (param: string) => {
      // trip-<id>
      if (param.startsWith('trip-')) {
        const tripIdStr = param.slice(5); // 'trip-123' → '123'
        const tripId = parseInt(tripIdStr, 10);

        if (isNaN(tripId) || tripId <= 0) {
          console.warn('[useStartParam] Некорректный trip ID в start_param:', param);
          // Мягко на main, без ошибки
          navigate('main');
          return;
        }

        try {
          // Загрузка поездки через API
          const response = await getTrip(tripId);
          const trip = mapTripCardToTrip(response.trip);

          // Переход на карточку поездки
          navigate('trip-details', trip);
        } catch (error) {
          console.error('[useStartParam] Ошибка загрузки поездки:', error);

          // Если поездки нет — мягко на main
          if (onError) {
            onError('Поездка не найдена');
          }
          navigate('main');
        }
        return;
      }

      // alert-<id>: шеринг-ссылка подписки пассажира → экран спроса для водителя
      // (сколько людей ждут по коридору + публикация поездки). id пока не нужен:
      // спрос агрегированный по коридору, не по конкретной подписке.
      if (param.startsWith('alert-')) {
        navigate('route-demand');
        return;
      }

      // Неизвестный префикс — обычный старт (intro)
      console.warn('[useStartParam] Неизвестный start_param:', param);
      // Без ошибки, просто игнорируем
    };

    handleStartParam(startParam);
  }, [navigate, onError, enabled]);
};
