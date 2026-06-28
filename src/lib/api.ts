/**
 * API-клиент для бэкенда Yaride (фундамент рыба→БД).
 * Fetch-обёртка к /api, Telegram initData в заголовке X-Telegram-Init-Data.
 */

import type {
  GetTripsRequest,
  GetTripsResponse,
  GetTripResponse,
  CreateBookingRequest,
  CreateBookingResponse,
  CreateAlertRequest,
  CreateAlertResponse,
  PublishTripRequest,
  PublishTripResponse,
  GetMyProfileResponse,
  GetMyTripsRequest,
  GetMyTripsResponse,
  CreateRatingRequest,
  CreateRatingResponse,
  GetTripBookingsResponse,
  CancelBookingRequest,
  CancelBookingResponse,
  GetRoutePointsResponse,
  GetMyTemplateResponse,
  SubmitLicenseRequest,
  SubmitLicenseResponse,
  ApiErrorResponse,
} from '../types/api.ts';

const API_BASE = '/api';

export class ApiException extends Error {
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

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
 * Общая fetch-обёртка: относительный базовый URL /api, заголовок X-Telegram-Init-Data,
 * JSON parse, обработка ошибок ({ error } → throw ApiException).
 */
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const initData = window.Telegram?.WebApp?.initData ?? '';

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': initData,
    ...(options?.headers ?? {}),
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiException(res.status, `Неожиданный Content-Type: ${contentType}`);
  }

  const body = (await res.json()) as T | ApiErrorResponse;

  if (!res.ok) {
    const err = body as ApiErrorResponse;
    throw new ApiException(res.status, err.error ?? 'Неизвестная ошибка API', err);
  }

  if (typeof body === 'object' && body !== null && 'error' in body) {
    const err = body as ApiErrorResponse;
    throw new ApiException(res.status, err.error, err);
  }

  return body as T;
}

/** GET /api/trips */
export async function getTrips(params: GetTripsRequest = {}): Promise<GetTripsResponse> {
  const query = new URLSearchParams();
  if (params.corridor !== undefined) {
    query.set('corridor', params.corridor);
  }
  if (params.window !== undefined) {
    query.set('window', params.window);
  }
  if (params.date !== undefined) {
    query.set('date', params.date);
  }

  const qs = query.toString();
  return apiFetch<GetTripsResponse>(`/trips${qs ? `?${qs}` : ''}`);
}

/** GET /api/trips/:id */
export async function getTrip(id: number): Promise<GetTripResponse> {
  return apiFetch<GetTripResponse>(`/trips/${id}`);
}

/** POST /api/bookings */
export async function createBooking(params: CreateBookingRequest): Promise<CreateBookingResponse> {
  return apiFetch<CreateBookingResponse>('/bookings', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/alerts */
export async function createAlert(params: CreateAlertRequest): Promise<CreateAlertResponse> {
  return apiFetch<CreateAlertResponse>('/alerts', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /api/trips */
export async function publishTrip(params: PublishTripRequest): Promise<PublishTripResponse> {
  return apiFetch<PublishTripResponse>('/trips', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /api/me/profile */
export async function getMyProfile(): Promise<GetMyProfileResponse> {
  return apiFetch<GetMyProfileResponse>('/me/profile');
}

/** GET /api/me/trips */
export async function getMyTrips(params: GetMyTripsRequest = {}): Promise<GetMyTripsResponse> {
  const query = new URLSearchParams();
  if (params.status !== undefined) {
    query.set('status', params.status);
  }

  const qs = query.toString();
  return apiFetch<GetMyTripsResponse>(`/me/trips${qs ? `?${qs}` : ''}`);
}

/** POST /api/ratings */
export async function createRating(params: CreateRatingRequest): Promise<CreateRatingResponse> {
  return apiFetch<CreateRatingResponse>('/ratings', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /api/trips/:id/bookings */
export async function getTripBookings(tripId: number): Promise<GetTripBookingsResponse> {
  return apiFetch<GetTripBookingsResponse>(`/trips/${tripId}/bookings`);
}

/** PATCH /api/bookings/:id */
export async function cancelBookingByDriver(bookingId: number): Promise<CancelBookingResponse> {
  const params: CancelBookingRequest = { action: 'cancel_by_driver' };
  return apiFetch<CancelBookingResponse>(`/bookings/${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

/** GET /api/route-points */
export async function getRoutePoints(): Promise<GetRoutePointsResponse> {
  return apiFetch<GetRoutePointsResponse>('/route-points');
}

/** GET /api/me/template */
export async function getMyTemplate(): Promise<GetMyTemplateResponse> {
  return apiFetch<GetMyTemplateResponse>('/me/template');
}

/** POST /api/me/license */
export async function submitLicense(params: SubmitLicenseRequest): Promise<SubmitLicenseResponse> {
  return apiFetch<SubmitLicenseResponse>('/me/license', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
