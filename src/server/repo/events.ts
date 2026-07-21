/**
 * Слой метрик ликвидности (CEO Council: «мерить метрики ликвидности НЕМЕДЛЕННО»).
 *
 * Захват событий воронки поиск → бронь / заявка-алерт в таблицу events (schema
 * v13). Это ФУНДАМЕНТ: точечная аналитика для будущих агрегатов (retention,
 * time-to-first-match и т.п.), сейчас — только сырые события + минимальный
 * агрегат в веб-админке (admin/main.py, GET /admin/metrics).
 *
 * logEvent НИКОГДА не бросает исключение и не реджектит промис — сбой записи
 * события (сеть/БД/что угодно) не должен положить основной API-запрос. Вызывать
 * fire-and-forget (`void logEvent(...)`) в обработчиках api.ts.
 */

import { ensureReady, getPool } from '../db.ts';

/** Тип события. Строка, а не union — таблица events.type без CHECK. Воронка
 * ликвидности (search/booking_created/alert_created) + поведение mini-app
 * (issue #473): ui_click / screen_view. */
export type EventType =
  | 'search'
  | 'booking_created'
  | 'alert_created'
  | 'ui_click'
  | 'screen_view';

export interface LogEventParams {
  type: EventType;
  /** Внутренний users.id (не telegram-id). null — событие без резолвленного профиля. */
  userId?: number | null;
  /** "<startPointId>-<endPointId>" или null, если коридор не определён целиком. */
  corridor?: string | null;
  /** Свободная полезная нагрузка: result_count, trip_id, booking_id, alert_id... */
  props?: Record<string, unknown>;
}

/**
 * Зафиксировать событие воронки. НЕблокирующая вставка: любая ошибка (БД
 * недоступна, ensureReady упал и т.п.) ловится и только логируется в stderr —
 * промис этой функции никогда не реджектится, вызывающий код продолжает
 * штатно отвечать пользователю.
 */
export async function logEvent(params: LogEventParams): Promise<void> {
  try {
    await ensureReady();
    await getPool().query(
      `INSERT INTO events(user_id, type, corridor, props)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        params.userId ?? null,
        params.type,
        params.corridor ?? null,
        JSON.stringify(params.props ?? {}),
      ],
    );
  } catch (e) {
    // Аналитика не должна ломать основной запрос — только логируем.
    console.error('[logEvent] Не удалось записать событие метрик (запрос не затронут):', e);
  }
}
