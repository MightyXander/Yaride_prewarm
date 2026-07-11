/**
 * appPrefetch — фоновый прогрев кэшей всех разделов после холодного старта
 * (issue #414). Цель: переход на уведомления/профиль/подстраницы/детали
 * активных поездок/профили участников — мгновенный, из screenDataCache.
 *
 * Прогрев ПОСЛЕДОВАТЕЛЬНЫЙ (стаггер из вежливости к серверу — rate-limit на
 * data-GET нет, но лавину не устраиваем). Каждый ключ: guard «уже в кэше →
 * пропустить», ошибки глотаются per-key (не валят очередь). Свежесть данных —
 * забота существующего SWR (useScreenData), здесь только первичный прогрев.
 *
 * НЕ префетчим (границы задачи): level-2 (профили авторов отзывов на
 * участников — комбинаторный взрыв), коридор (useCorridorTrips грузится на
 * старте App сам), профиль целиком (ProfileContext + localStorage-кэш).
 */
import { useEffect } from 'react';
import { getScreenData, prefetchScreenData } from './screenDataCache';
import {
  fetchMyTripsUpcoming,
  fetchMyTripsPast,
  fetchMyCars,
  fetchMyAlerts,
  fetchSafety,
  fetchNotifications,
  makeUserProfileFetcher,
  makeUserReviewsFetcher,
  makeTripParticipantsFetcher,
  makeTripBookingsFetcher,
} from './screenFetchers';
import { useProfile } from '../contexts/ProfileContext';
import type { TripParticipant } from '../types/api';

/** Пауза между префетчами — стаггер очереди. */
const STAGGER_MS = 250;

/** Кап на чужие профили за один прогрев — защита от комбинаторики. */
const MAX_PARTICIPANT_PROFILES = 10;

function delay(ms: number): Promise<void> {
  // Не Promise.withResolvers: проект собирается под lib ES2023 (tsconfig.app.json),
  // а старые Telegram-webview его не поддерживают (ES2024).
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Прогревает один ключ: уже в кэше → пропустить (без стаггер-паузы), иначе
 * префетч + пауза. Ошибка глотается (prefetchScreenData её не кэширует —
 * реальный заход на экран начнёт фетч заново). Возвращает данные ключа,
 * если они есть (для каскада), иначе undefined.
 */
async function warmKey<T>(key: string, fetcher: () => Promise<T>): Promise<T | undefined> {
  const cached = getScreenData<T>(key);
  if (cached !== undefined) return cached;
  try {
    const result = await prefetchScreenData(key, fetcher);
    await delay(STAGGER_MS);
    return result;
  } catch {
    // per-key: очередь продолжается, следующий заход на экран повторит фетч
    return undefined;
  }
}

/**
 * Фоновый прогрев всех разделов. Очередь:
 * 1) уведомления (перенесён прежний прогрев из App.tsx, issue #352);
 * 2) подстраницы профиля: my-trips:upcoming/past, my-cars, my-alerts, safety;
 * 3) свои профиль и отзывы (myUserId из ProfileContext; null — пропускаем,
 *    эффект перезапустится, когда id появится);
 * 4) каскад по активным поездкам из my-trips:upcoming: своя → брони
 *    (trip-bookings:{id}), чужая с активной бронью → участники
 *    (trip-participants:{id}) → профили+отзывы участников (кроме себя),
 *    суммарно не более MAX_PARTICIPANT_PROFILES чужих профилей.
 */
export async function warmAppCaches(myUserId: number | null): Promise<void> {
  await warmKey('notifications', fetchNotifications);

  const upcoming = await warmKey('my-trips:upcoming', fetchMyTripsUpcoming);
  await warmKey('my-trips:past', fetchMyTripsPast);
  await warmKey('my-cars', fetchMyCars);
  await warmKey('my-alerts', fetchMyAlerts);
  await warmKey('safety', fetchSafety);

  if (myUserId !== null) {
    await warmKey(`user-profile:${myUserId}`, makeUserProfileFetcher(myUserId));
    await warmKey(`user-reviews:${myUserId}`, makeUserReviewsFetcher(myUserId));
  }

  if (!upcoming) return;

  // Каскад: участники активных поездок и их профили/отзывы.
  const participantIds = new Set<number>();
  for (const trip of upcoming) {
    // Активная поездка: не завершённая и не отменённая.
    if (trip.trip_status === 'completed' || trip.trip_status === 'cancelled') continue;
    const tripId = trip.trip_id;
    if (!Number.isFinite(tripId)) continue;

    if (trip.role === 'driver') {
      // Своя поездка: раздел «Брони» в TripDetailsScreen.
      await warmKey(`trip-bookings:${tripId}`, makeTripBookingsFetcher(tripId));
    } else if (trip.booking_status === 'active') {
      // Чужая поездка с активной бронью: «Кто едет» (сервер отдаёт
      // участников только участникам — без брони запрос не шлём).
      const participants = await warmKey<TripParticipant[]>(
        `trip-participants:${tripId}`,
        makeTripParticipantsFetcher(tripId),
      );
      for (const p of participants ?? []) {
        if (p.user_id !== myUserId) participantIds.add(p.user_id);
      }
    }
  }

  let warmedProfiles = 0;
  for (const userId of participantIds) {
    if (warmedProfiles >= MAX_PARTICIPANT_PROFILES) break;
    await warmKey(`user-profile:${userId}`, makeUserProfileFetcher(userId));
    await warmKey(`user-reviews:${userId}`, makeUserReviewsFetcher(userId));
    warmedProfiles += 1;
  }
}

/**
 * Мост между App и прогревом: App рендерит ProfileProvider сам (useProfile
 * внутри App недоступен), поэтому idle-эффект живёт в этом null-компоненте
 * ВНУТРИ провайдера. requestIdleCallback не блокирует первый рендер; в
 * браузерах без него (Safari) — fallback на setTimeout 2s. Эффект
 * перезапускается при появлении profile.id (греет свои отзывы и каскад);
 * повторный запуск дёшев: guard «уже в кэше» пропускает прогретые ключи.
 */
export function AppCacheWarmer(): null {
  const { profile } = useProfile();
  const myUserId = profile?.id ?? null;

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const warm = () => {
      void warmAppCaches(myUserId);
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(warm);
      return () => win.cancelIdleCallback?.(id);
    }

    const timeoutId = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [myUserId]);

  return null;
}
