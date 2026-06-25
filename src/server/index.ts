/**
 * Точка входа бэкенд-слоя данных prewarm.
 *
 * initDb() открывает соединение, создаёт схему и сидит коридор при первом старте.
 * Вызывается из server.js перед стартом Express, чтобы БД была готова к запросам API
 * (следующий issue). Реэкспорт repo-функций — публичный контракт слоя данных.
 */

import { getDb, resolveDbPath, closeDb } from './db.ts';

export { resolveDbPath, closeDb };
export {
  findOpenTrips,
  getTripCard,
  listRoutePoints,
  createBooking,
} from './repo.ts';
export type {
  TimeSlot,
  TripListItem,
  TripCard,
  BookingResult,
  FindTripsParams,
} from './repo.ts';

/**
 * Инициализировать БД (схема + сид). Возвращает путь к файлу БД для лога.
 * Идемпотентно: повторный вызов вернёт то же соединение.
 */
export function initDb(): { dbPath: string } {
  getDb();
  return { dbPath: resolveDbPath() };
}
