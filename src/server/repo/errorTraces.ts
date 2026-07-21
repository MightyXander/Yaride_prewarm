/**
 * Слой трейсов ошибок (issue #470, наблюдаемость).
 *
 * Любая необработанная ошибка фронта (POST /api/errors/report) и любой 500
 * бэка (wrap()/uncaughtException/unhandledRejection в server.js) сохраняются
 * в таблицу error_traces (schema v21) — дебаг по БД без доступа к stdout.
 *
 * insertErrorTrace НИКОГДА не бросает исключение и не реджектит промис (по
 * образцу logEvent из events.ts): сбой записи трейса не должен положить ни
 * API-запрос, ни аварийное завершение процесса. Вызывать fire-and-forget
 * (`void insertErrorTrace(...)`).
 */

import { ensureReady, getPool } from '../db.ts';

/** Лимиты против мусора/спама (issue #470): сверх — обрезаем, не отклоняем. */
const MESSAGE_MAX_CHARS = 2000;
const STACK_MAX_CHARS = 8000;
const CONTEXT_MAX_BYTES = 2048;

export interface InsertErrorTraceParams {
  source: 'frontend' | 'backend';
  /** Внутренний users.id (не telegram-id). null — ошибка без резолвленного профиля. */
  userId?: number | null;
  /** Класс/тип ошибки (err.name): TypeError, ChunkLoadError... */
  errorType?: string | null;
  message: string;
  stack?: string | null;
  /** Свободный контекст: path, method, url, componentStack... */
  context?: Record<string, unknown>;
}

/**
 * Сериализовать context в JSON не длиннее CONTEXT_MAX_BYTES. Простое обрезание
 * строки дало бы невалидный JSONB, поэтому при превышении лимита кладём валидный
 * объект-заглушку с усечённым превью исходного JSON.
 */
function serializeContext(context: Record<string, unknown> | undefined): string {
  let raw: string;
  try {
    raw = JSON.stringify(context ?? {});
  } catch {
    // Циклические ссылки и прочая несериализуемость — не повод терять трейс.
    return '{"_unserializable": true}';
  }
  if (Buffer.byteLength(raw, 'utf8') <= CONTEXT_MAX_BYTES) {
    return raw;
  }
  // Превью режем с запасом: JSON.stringify экранирует кавычки/бэкслэши,
  // многобайтовые символы раздувают байтовый размер относительно длины строки.
  return JSON.stringify({ _truncated: true, preview: raw.slice(0, 1500) });
}

/**
 * Записать трейс ошибки. НЕблокирующая вставка: любая ошибка (БД недоступна,
 * ensureReady упал и т.п.) ловится и только логируется в stderr — промис этой
 * функции никогда не реджектится.
 */
export async function insertErrorTrace(params: InsertErrorTraceParams): Promise<void> {
  try {
    await ensureReady();
    const message = (params.message || 'Unknown error').slice(0, MESSAGE_MAX_CHARS);
    const stack = params.stack == null ? null : params.stack.slice(0, STACK_MAX_CHARS);
    await getPool().query(
      `INSERT INTO error_traces(source, user_id, error_type, message, stack, context)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        params.source,
        params.userId ?? null,
        params.errorType ?? null,
        message,
        stack,
        serializeContext(params.context),
      ],
    );
  } catch (e) {
    // Трейсинг не должен ломать основной поток — только логируем.
    console.error('[insertErrorTrace] Не удалось записать трейс ошибки (запрос не затронут):', e);
  }
}

export interface ErrorTraceRow {
  id: number;
  source: 'frontend' | 'backend';
  user_id: number | null;
  error_type: string | null;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
  created_at: Date;
}

/** Последние трейсы (новые сверху) — для будущего просмотра в админке (#471+). */
export async function listRecentTraces(limit: number): Promise<ErrorTraceRow[]> {
  await ensureReady();
  const res = await getPool().query<ErrorTraceRow>(
    `SELECT id, source, user_id, error_type, message, stack, context, created_at
       FROM error_traces
      ORDER BY id DESC
      LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  );
  return res.rows;
}

/** Удалить трейсы старше N дней (ретенция; server.js — при старте и раз в 24ч). */
export async function deleteTracesOlderThan(days: number): Promise<number> {
  await ensureReady();
  const res = await getPool().query(
    `DELETE FROM error_traces WHERE created_at < now() - make_interval(days => $1)`,
    [days],
  );
  return res.rowCount ?? 0;
}
