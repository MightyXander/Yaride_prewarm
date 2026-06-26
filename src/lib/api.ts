/**
 * Фронтенд API-клиент для Yaride (фаза рыба→БД).
 *
 * Тонкая fetch-обёртка к бэкенду на /api:
 * - Относительный базовый URL (тот же origin, прод-Postgres уже есть)
 * - Telegram initData из window.Telegram?.WebApp?.initData → заголовок X-Telegram-Init-Data
 * - JSON parse, единый разбор ошибок ({ error } → throw типизированной ошибки со status)
 * - Типы согласованы с src/server/api.ts и src/server/repo.ts (issue #42)
 */

import type {
  TripListItem,
  TripCard,
  CreateBookingRequest,
  CreateBookingResponse,
  CreateAlertRequest,
  CreateAlertResponse,
  PublishTripRequest,
  PublishTripResponse,
  UserProfile,
  UserTripItem,
  TripStatusFilter,
  CreateRatingRequest,
  CreateRatingResponse,
  CancelBookingRequest,
  CancelBookingResponse,
  BookingDetail,
  ApiError,
  TimeSlot,
} from '../types/api.ts';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: unknown;
        colorScheme?: string;
        ready?: () => void;
        expand?: () => void;
        onEvent?: (eventType: string, callback: () => void) => void;
        offEvent?: (eventType: string, callback: () => void) => void;
        isVersionAtLeast?: (version: string) => boolean;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'success' | 'warning' | 'error') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

/**
 * Ошибка API с HTTP-статусом и сообщением.
 */
export class ApiException extends Error {
  public status: number;
  public details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiException';
    this.status = status;
    this.details = details;
  }
}

/**
 * Базовый URL API (относительный).
 */
const API_BASE = '/api';

/**
 * Получить Telegram initData из Telegram Web App (если доступно).
 * В dev-окружении без Telegram — пустая строка (бэкенд dev-bypass).
 */
function getTelegramInitData(): string {
  return window.Telegram?.WebApp?.initData ?? '';
}

/**
 * Универсальная fetch-обёртка для JSON API.
 * - Автоматически добавляет заголовок X-Telegram-Init-Data
 * - Парсит JSON-ответ
 * - Бросает ApiException при ошибках (status >= 400 или { error } в теле)
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const initData = getTelegramInitData();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': initData,
    ...options.headers,
  };

  const url = `${API_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new ApiException(
      0,
      `Сетевая ошибка: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // Если не удалось распарсить JSON
    if (!response.ok) {
      throw new ApiException(
        response.status,
        `HTTP ${response.status}: ${response.statusText}`,
      );
    }
    throw new ApiException(response.status, 'Некорректный JSON-ответ от сервера');
  }

  // Проверка на ошибку в теле ответа (формат { error: string, ... })
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as ApiError).error === 'string'
  ) {
    const apiError = data as ApiError;
    throw new ApiException(response.status, apiError.error, apiError);
  }

  if (!response.ok) {
    throw new ApiException(
      response.status,
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : `HTTP ${response.status}`,
    );
  }

  return data as T;
}

/**
 * Построить query string из параметров (только непустые значения).
 */
function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

// ===== API методы =====

export interface GetTripsParams {
  corridor?: string;
  window?: TimeSlot;
  date?: string;
}

/**
 * GET /api/trips — список открытых поездок по коридору/окну/дате.
 */
export async function getTrips(params: GetTripsParams = {}): Promise<TripListItem[]> {
  const query = buildQuery({
    corridor: params.corridor,
    window: params.window,
    date: params.date,
  });
  const response = await apiFetch<{ trips: TripListItem[] }>(`/trips${query}`);
  return response.trips;
}

/**
 * GET /api/trips/:id — карточка поездки или 404.
 */
export async function getTrip(id: number): Promise<TripCard> {
  const response = await apiFetch<{ trip: TripCard }>(`/trips/${id}`);
  return response.trip;
}

/**
 * POST /api/bookings — создать бронь на поездку.
 */
export async function createBooking(
  params: Omit<CreateBookingRequest, 'initData'>,
): Promise<CreateBookingResponse['booking']> {
  const initData = getTelegramInitData();
  const response = await apiFetch<CreateBookingResponse>('/bookings', {
    method: 'POST',
    body: JSON.stringify({ ...params, initData }),
  });
  return response.booking;
}

/**
 * POST /api/alerts — создать подписку на коридор/дату.
 */
export async function createAlert(
  params: Omit<CreateAlertRequest, 'initData'>,
): Promise<CreateAlertResponse['alert']> {
  const initData = getTelegramInitData();
  const response = await apiFetch<CreateAlertResponse>('/alerts', {
    method: 'POST',
    body: JSON.stringify({ ...params, initData }),
  });
  return response.alert;
}

/**
 * POST /api/trips — опубликовать поездку из шаблона.
 */
export async function publishTrip(
  params: Omit<PublishTripRequest, 'initData'>,
): Promise<PublishTripResponse['trip']> {
  const initData = getTelegramInitData();
  const response = await apiFetch<PublishTripResponse>('/trips', {
    method: 'POST',
    body: JSON.stringify({ ...params, initData }),
  });
  return response.trip;
}

/**
 * GET /api/me/profile — профиль текущего пользователя по initData.
 */
export async function getMyProfile(): Promise<UserProfile> {
  const response = await apiFetch<{ profile: UserProfile }>('/me/profile');
  return response.profile;
}

/**
 * GET /api/me/trips?status=upcoming|past — поездки текущего пользователя.
 */
export async function getMyTrips(status: TripStatusFilter): Promise<UserTripItem[]> {
  const query = buildQuery({ status });
  const response = await apiFetch<{ trips: UserTripItem[] }>(`/me/trips${query}`);
  return response.trips;
}

/**
 * POST /api/ratings — оценить участника поездки.
 */
export async function createRating(
  params: Omit<CreateRatingRequest, 'initData'>,
): Promise<CreateRatingResponse['rating']> {
  const initData = getTelegramInitData();
  const response = await apiFetch<CreateRatingResponse>('/ratings', {
    method: 'POST',
    body: JSON.stringify({ ...params, initData }),
  });
  return response.rating;
}

/**
 * PATCH /api/bookings/:id — водитель отклоняет бронь.
 */
export async function cancelBookingByDriver(
  id: number,
): Promise<CancelBookingResponse['result']> {
  const initData = getTelegramInitData();
  const response = await apiFetch<CancelBookingResponse>(`/bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'cancel_by_driver', initData } satisfies CancelBookingRequest),
  });
  return response.result;
}

/**
 * GET /api/trips/:id/bookings — список броней для поездки (для водителя).
 */
export async function getTripBookings(tripId: number): Promise<BookingDetail[]> {
  const response = await apiFetch<{ bookings: BookingDetail[] }>(`/trips/${tripId}/bookings`);
  return response.bookings;
}
