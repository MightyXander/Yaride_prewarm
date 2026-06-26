/**
 * Точка входа бэкенд-слоя данных prewarm (PostgreSQL).
 *
 * initDb() создаёт пул, прогоняет схему и сидит коридор при первом старте.
 * Вызывается из server.js перед стартом Express, чтобы БД была готова к запросам
 * API (следующий issue). pingDb() — лёгкий SELECT 1 для /health.
 * Реэкспорт repo-функций — публичный контракт слоя данных.
 */

import { ensureReady, getPool, closeDb, getSchemaName } from './db.ts';

export { closeDb, getSchemaName };
export {
  findOpenTrips,
  getTripCard,
  listRoutePoints,
  createBooking,
  createRouteAlert,
  createTripFromTemplate,
  ensureUser,
  listTripTemplates,
  getUserProfile,
  getUserTrips,
  createRating,
  getTripBookings,
  cancelBookingByDriver,
} from './repo.ts';
export type {
  TimeSlot,
  TripListItem,
  TripCard,
  BookingResult,
  FindTripsParams,
  UserProfile,
  UserTripItem,
  CreateRatingParams,
  CreateRatingResult,
  BookingDetail,
  CancelBookingResult,
} from './repo.ts';

// JSON-API обработчики (issue #10): Express-независимые, подключаются в server.js.
export {
  handleListTrips,
  handleGetTrip,
  handleCreateBooking,
  handleCreateAlert,
  handlePublishTrip,
  handleGetMyProfile,
  handleGetMyTrips,
  handleGetMyTemplate,
  handleCreateRating,
  handleGetTripBookings,
  handleCancelBooking,
  handleListRoutePoints,
  handleDebugCounts,
} from './api.ts';
export type { ApiRequest, ApiResponse } from './api.ts';

/**
 * Инициализировать БД (пул + схема + сид). Идемпотентно: повторный вызов
 * дождётся той же инициализации. Бросает понятную ошибку без DATABASE_URL.
 */
export async function initDb(): Promise<void> {
  await ensureReady();
}

/** Лёгкая проверка живости БД для /health: SELECT 1. */
export async function pingDb(): Promise<boolean> {
  const res = await getPool().query<{ ok: number }>('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}
