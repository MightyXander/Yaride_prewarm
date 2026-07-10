/**
 * Repo-слой доступа к данным (по образцу MightyXander/Yaride app/repo.py).
 *
 * PostgreSQL/node-postgres, async. Под MVP «Один туннель»: список поездок по
 * коридору/окну на дату, карточка поездки с профилем водителя, создание брони
 * с защитой от гонок за места (транзакция BEGIN/COMMIT + условный UPDATE ...
 * RETURNING), справочник точек.
 *
 * Разбит на доменные модули (issue #289): users, sessions, credentials, trips,
 * bookings, ratings, cars, notifications, license, alerts, push-tokens,
 * templates, debug, events (слой метрик ликвидности, CEO Council),
 * sms-verification (SMS-подтверждение номера, issue #328), safety (настройки
 * безопасности + доверенный контакт, issue #344). Этот barrel реэкспортирует
 * весь публичный контракт слоя — внешние импортёры (`from './repo.ts'`) не меняются.
 *
 * internalUserIdByTg — единственный публичный экспорт из внутреннего _shared.ts
 * (мост сессии, issue #258); getInternalUserId/recomputeUserTripCounters там же
 * остаются приватными для доменных модулей и наружу не публикуются.
 */

export { internalUserIdByTg } from './_shared.ts';

export * from './users.ts';
export * from './sessions.ts';
export * from './credentials.ts';
export * from './trips.ts';
export * from './alerts.ts';
export * from './templates.ts';
export * from './cars.ts';
export * from './push-tokens.ts';
export * from './bookings.ts';
export * from './ratings.ts';
export * from './license.ts';
export * from './notifications.ts';
export * from './debug.ts';
export * from './merge.ts';
export * from './events.ts';
export * from './sms-verification.ts';
export * from './safety.ts';
export * from './telegram-link.ts';
