/**
 * Единый источник серверного «сейчас» в фиксированной МСК (UTC+3, без DST).
 *
 * TZ хоста/контейнера не гарантирована (прод живёт в UTC) — вся аудитория
 * в Ярославле, поэтому «сегодня/сейчас» во всей продуктовой логике считаем
 * по МСК, а не по локальной зоне процесса (issue #332: поездки, созданные
 * в 00:00–02:59 МСК, не попадали в коридор — серверная дата ещё «вчера»).
 */

export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Текущий момент, сдвинутый на МСК-оффсет (UTC-геттеры этого Date дают МСК-стенное время). */
export function mskNow(d: Date = new Date()): Date {
  return new Date(d.getTime() + MSK_OFFSET_MS);
}

/** Текущая дата в МСК, формат YYYY-MM-DD. */
export function todayMskISO(d: Date = new Date()): string {
  const msk = mskNow(d);
  const yyyy = msk.getUTCFullYear();
  const mm = String(msk.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(msk.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Текущее время в МСК, формат HH:MM. */
export function nowMskHHMM(d: Date = new Date()): string {
  const msk = mskNow(d);
  const hh = String(msk.getUTCHours()).padStart(2, '0');
  const mm = String(msk.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
