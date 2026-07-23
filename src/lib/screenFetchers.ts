/**
 * Загрузчики данных для useScreenData(...) на подстраницах профиля и уведомлениях
 * (issue #352). Вынесены из самих экранов в отдельный модуль без React-компонентов,
 * чтобы ProfileScreen (префетч подстраниц при маунте) и App.tsx (idle-префетч
 * уведомлений) могли дёрнуть их напрямую, не импортируя lazy-компоненты экранов —
 * иначе прогрев утащил бы весь чанк экрана в основной бандл и свёл на нет
 * code-splitting (см. src/lib/screenRegistry.tsx).
 */
import {
  getMyTrips,
  getMyCars,
  getMyAlerts,
  getDemand,
  getMySafety,
  getNotifications,
  getUserProfile,
  getUserReviews,
  getTripParticipants,
  getTripBookings,
  ApiException,
} from './api';
import type {
  UserTripItem,
  Car,
  MyAlertItem,
  DemandSlot,
  GetMySafetyResponse,
  NotificationItem,
  PublicUserProfile,
  UserReview,
  TripParticipant,
  BookingDetail,
} from '../types/api';

// ---- Мои поездки ------------------------------------------------------------

// Демо-данные для браузера без Telegram (graceful fallback при 401, issue #244).
// Даты относительно сегодня: upcoming = сегодня/завтра, past = вчера/позавчера.
function getDemoTrips(): { upcomingTrips: UserTripItem[]; pastTrips: UserTripItem[] } {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const upcomingTrips: UserTripItem[] = [
    {
      trip_id: 1,
      role: 'passenger',
      trip_date: formatDate(today),
      departure_time: '07:40:00',
      time_slot: 'morning',
      start_title: 'Брагино, ул. Урицкого, 12',
      end_title: 'Центр, пл. Волкова',
      price_rub: 100,
      seats_total: 3,
      seats_booked: 1,
      trip_status: 'open',
      booking_id: 10,
      booking_status: 'active',
      passenger_seats: 1,
      driver_id: 5,
      rated_by_me: false,
    },
    {
      trip_id: 2,
      role: 'driver',
      trip_date: formatDate(tomorrow),
      departure_time: '17:40:00',
      time_slot: 'evening',
      start_title: 'Центр, пл. Волкова',
      end_title: 'Брагино, ул. Урицкого, 12',
      price_rub: 150,
      seats_total: 3,
      seats_booked: 0,
      trip_status: 'open',
      booking_id: null,
      booking_status: null,
      passenger_seats: null,
      driver_id: null,
      rated_by_me: false,
    },
  ];

  const pastTrips: UserTripItem[] = [
    {
      trip_id: 3,
      role: 'passenger',
      trip_date: formatDate(yesterday),
      departure_time: '07:55:00',
      time_slot: 'morning',
      start_title: 'Брагино, пр-т Дзержинского, 8',
      end_title: 'Центр, пл. Волкова',
      price_rub: 100,
      seats_total: 3,
      seats_booked: 2,
      trip_status: 'completed',
      booking_id: 9,
      booking_status: 'active',
      passenger_seats: 1,
      driver_id: 7,
      rated_by_me: false,
    },
  ];

  return { upcomingTrips, pastTrips };
}

export async function fetchMyTripsUpcoming(): Promise<UserTripItem[]> {
  try {
    const res = await getMyTrips({ status: 'upcoming' });
    return res.trips;
  } catch (err) {
    if (err instanceof ApiException && err.status === 401) return getDemoTrips().upcomingTrips;
    throw err;
  }
}

export async function fetchMyTripsPast(): Promise<UserTripItem[]> {
  try {
    const res = await getMyTrips({ status: 'past' });
    return res.trips;
  } catch (err) {
    if (err instanceof ApiException && err.status === 401) return getDemoTrips().pastTrips;
    throw err;
  }
}

// ---- Мои машины ---------------------------------------------------------

// Демо-данные для браузера без Telegram (graceful fallback при 401).
const DEMO_CARS: Car[] = [{ id: 1, model: 'Лада Веста', color: 'чёрный', plate: 'А567РУ' }];

export async function fetchMyCars(): Promise<Car[]> {
  try {
    const res = await getMyCars();
    return res.cars;
  } catch (err) {
    if (err instanceof ApiException && err.status === 401) return DEMO_CARS;
    throw err;
  }
}

// ---- Мои заявки -----------------------------------------------------------

// Демо-данные для браузера без Telegram (graceful fallback при 401) — тот же
// приём, что MyTripsScreen/MyCarsScreen (issue #244).
function getDemoAlerts(): MyAlertItem[] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return [
    {
      id: 1,
      fromPointId: 1,
      toPointId: 2,
      fromTitle: 'Брагино, ул. Урицкого, 12',
      toTitle: 'Центр, пл. Волкова',
      desiredDate: formatDate(tomorrow),
      desiredTime: '08:00',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ];
}

export async function fetchMyAlerts(): Promise<MyAlertItem[]> {
  try {
    const res = await getMyAlerts();
    return res.alerts;
  } catch (err) {
    if (err instanceof ApiException && err.status === 401) return getDemoAlerts();
    throw err;
  }
}

// ---- Спрос по коридору (подписки на маршрут) --------------------------------

// Демо-спрос для браузера без Telegram (graceful fallback при 401) — тот же
// приём, что fetchMyAlerts/fetchMyCars (issue #244).
function getDemoDemand(): DemandSlot[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');
  const date = `${y}-${m}-${d}`;
  return [
    { fromPointId: 1, toPointId: 2, fromTitle: 'Брагино', toTitle: 'Центр', desiredDate: date, desiredTime: '08:00', count: 3, sampleNames: ['Мария', 'Дмитрий', 'Иван'] },
    { fromPointId: 1, toPointId: 2, fromTitle: 'Брагино', toTitle: 'Центр', desiredDate: date, desiredTime: '09:00', count: 1, sampleNames: ['Кирилл'] },
    { fromPointId: 2, toPointId: 1, fromTitle: 'Центр', toTitle: 'Брагино', desiredDate: date, desiredTime: null, count: 2, sampleNames: ['Сергей', 'Роман'] },
  ];
}

export async function fetchDemand(): Promise<DemandSlot[]> {
  try {
    const res = await getDemand();
    return res.demand;
  } catch (err) {
    if (err instanceof ApiException && err.status === 401) return getDemoDemand();
    throw err;
  }
}

// ---- Безопасность ----------------------------------------------------------

// Дефолты совпадают с серверными (см. GET /api/me/safety) — до ответа сети
// тумблеры уже показывают корректное для нового пользователя состояние.
export const DEFAULT_SAFETY: GetMySafetyResponse = {
  sosEnabled: true,
  autoShare: false,
  womenOnly: true,
  trustedContact: null,
  sex: 'unknown',
};

export async function fetchSafety(): Promise<GetMySafetyResponse> {
  try {
    return await getMySafety();
  } catch {
    // Тихо остаёмся на дефолтах — следующее переключение тумблера всё равно
    // отправит PUT с актуальным полным состоянием.
    return DEFAULT_SAFETY;
  }
}

// ---- Уведомления ------------------------------------------------------------

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const res = await getNotifications();
  return res.notifications;
}

// ---- Публичный профиль / отзывы ---------------------------------------------

// Фабрики (а не готовые функции): userId заранее неизвестен. Используются и
// экраном UserProfileScreen, и фоновым прогревом (issue #414) — ключи кэша
// ДОЛЖНЫ оставаться ровно `user-profile:${userId}` / `user-reviews:${userId}`.

export function makeUserProfileFetcher(userId: number): () => Promise<PublicUserProfile> {
  return async () => {
    const res = await getUserProfile(userId);
    return res.profile;
  };
}

export function makeUserReviewsFetcher(userId: number): () => Promise<UserReview[]> {
  return async () => {
    const res = await getUserReviews(userId);
    return res.reviews;
  };
}

// ---- Участники / брони поездки ----------------------------------------------

// Ключи кэша: `trip-participants:${tripId}` / `trip-bookings:${tripId}`
// (TripDetailsScreen + фоновый прогрев, issue #414).

export function makeTripParticipantsFetcher(tripId: number): () => Promise<TripParticipant[]> {
  return async () => {
    const res = await getTripParticipants(tripId);
    return res.participants;
  };
}

export function makeTripBookingsFetcher(tripId: number): () => Promise<BookingDetail[]> {
  return async () => {
    const res = await getTripBookings(tripId);
    return res.bookings;
  };
}
