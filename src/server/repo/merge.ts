/**
 * Слияние двух карточек users в одну (issue #300, defence-часть).
 *
 * Появлялись дубли: у одного человека TG-карточка (tg_user_id) и отдельная
 * браузерная учётка (email/пароль), т.к. общего идентификатора между ними нет.
 * Здесь — переиспользуемое, транзакционное слияние: все ссылки FK переносим
 * dupe → keep (с разрешением коллизий уникальных индексов), данные веб-входа
 * (email/username/password_hash) переносим на keep, счётчики/рейтинг пересчитываем
 * из источников, dupe удаляем. Логика повторяет ручной мёрж дубля founder'а.
 */

import { withTransaction } from '../db.ts';

/**
 * Слить карточку `dupeId` в `keepId`. keep остаётся, dupe удаляется; данные входа
 * (email/username/password_hash/имя/возраст) переносятся на keep. Идемпотентно
 * по сути (после удаления dupe повторный вызов ничего не найдёт).
 *
 * ВНИМАНИЕ: keepId ≠ dupeId должно проверяться вызывающей стороной.
 */
export async function mergeAccounts(keepId: number, dupeId: number): Promise<void> {
  await withTransaction(async (client) => {
    // Данные входа дубля во временную таблицу (после DELETE dupe их уже не достать).
    await client.query(
      `CREATE TEMP TABLE _dupe ON COMMIT DROP AS
         SELECT email, username, password_hash, first_name, last_name, age
         FROM users WHERE id = $1`,
      [dupeId],
    );

    // bookings: UNIQUE(trip_id, passenger_id) — сначала убираем брони dupe на те
    // поездки, где keep уже забронирован, затем переносим остальные.
    await client.query(
      `DELETE FROM bookings b WHERE b.passenger_id = $1
         AND EXISTS (SELECT 1 FROM bookings x WHERE x.passenger_id = $2 AND x.trip_id = b.trip_id)`,
      [dupeId, keepId],
    );
    await client.query('UPDATE bookings SET passenger_id = $2 WHERE passenger_id = $1', [dupeId, keepId]);

    // ratings: UNIQUE(trip_id, rater_id, ratee_id) — по обеим ролям.
    await client.query(
      `DELETE FROM ratings r WHERE r.rater_id = $1
         AND EXISTS (SELECT 1 FROM ratings x WHERE x.trip_id = r.trip_id AND x.rater_id = $2 AND x.ratee_id = r.ratee_id)`,
      [dupeId, keepId],
    );
    await client.query('UPDATE ratings SET rater_id = $2 WHERE rater_id = $1', [dupeId, keepId]);
    await client.query(
      `DELETE FROM ratings r WHERE r.ratee_id = $1
         AND EXISTS (SELECT 1 FROM ratings x WHERE x.trip_id = r.trip_id AND x.rater_id = r.rater_id AND x.ratee_id = $2)`,
      [dupeId, keepId],
    );
    await client.query('UPDATE ratings SET ratee_id = $2 WHERE ratee_id = $1', [dupeId, keepId]);

    // push_tokens: UNIQUE(token).
    await client.query(
      `DELETE FROM push_tokens p WHERE p.user_id = $1
         AND EXISTS (SELECT 1 FROM push_tokens x WHERE x.user_id = $2 AND x.token = p.token)`,
      [dupeId, keepId],
    );
    await client.query('UPDATE push_tokens SET user_id = $2 WHERE user_id = $1', [dupeId, keepId]);

    // Простые ссылки (без уникальных ограничений по user).
    await client.query('UPDATE trips SET driver_id = $2 WHERE driver_id = $1', [dupeId, keepId]);
    await client.query('UPDATE trip_templates SET driver_id = $2 WHERE driver_id = $1', [dupeId, keepId]);
    await client.query('UPDATE cars SET driver_id = $2 WHERE driver_id = $1', [dupeId, keepId]);
    await client.query('UPDATE license_requests SET driver_id = $2 WHERE driver_id = $1', [dupeId, keepId]);
    await client.query('UPDATE route_alerts SET passenger_id = $2 WHERE passenger_id = $1', [dupeId, keepId]);
    await client.query('UPDATE notifications SET user_id = $2 WHERE user_id = $1', [dupeId, keepId]);
    await client.query('UPDATE notifications SET ref_user_id = $2 WHERE ref_user_id = $1', [dupeId, keepId]);
    await client.query('UPDATE sessions SET user_id = $2 WHERE user_id = $1', [dupeId, keepId]);

    // Удаляем dupe — освобождает его email/username в уникальных индексах и снимает
    // CHECK (tg_user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL)).
    await client.query('DELETE FROM users WHERE id = $1', [dupeId]);

    // Переносим данные входа dupe на keep (email/username/password_hash обязательно;
    // имя/возраст — только если у keep их нет).
    await client.query(
      `UPDATE users SET
         email         = (SELECT email FROM _dupe),
         username      = (SELECT username FROM _dupe),
         password_hash = (SELECT password_hash FROM _dupe),
         first_name    = COALESCE(first_name, (SELECT first_name FROM _dupe)),
         last_name     = COALESCE(last_name,  (SELECT last_name FROM _dupe)),
         age           = COALESCE(age,        (SELECT age FROM _dupe))
       WHERE id = $1`,
      [keepId],
    );

    // Пересчёт денормализованных счётчиков/рейтинга из источников (как бэкафилл #243).
    await client.query(
      `UPDATE users u SET
         trips_driver_count    = (SELECT COUNT(*) FROM trips t WHERE t.driver_id = u.id AND t.status <> 'cancelled'),
         trips_passenger_count = (SELECT COUNT(*) FROM bookings b WHERE b.passenger_id = u.id AND b.status = 'active'),
         rating_avg            = (SELECT COALESCE(AVG(r.stars), 0.0) FROM ratings r WHERE r.ratee_id = u.id),
         rating_count          = (SELECT COUNT(*) FROM ratings r WHERE r.ratee_id = u.id)
       WHERE u.id = $1`,
      [keepId],
    );
  });
}
