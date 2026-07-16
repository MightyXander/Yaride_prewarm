/**
 * Локальная дата и валидация времени выезда (issue #330).
 *
 * `toISOString().split('T')[0]` конвертирует в UTC и в окне 00:00–02:59 по
 * Ярославлю (UTC+3) откатывает дату на вчера. `localDateStr` использует
 * getFullYear()/getMonth()/getDate() — тот же паттерн, что уже в
 * src/components/ui/Calendar.tsx.
 */

/** Минимальный запас времени (в минутах) между «сейчас» и моментом выезда. */
export const MIN_LEAD_MINUTES = 10;

/** Результат валидации момента выезда. */
export type DepartureValidation = 'past' | 'too_soon' | null;

/** Тексты ошибок — единые для клиента и сервера (см. src/server/api.ts). */
export const DEPARTURE_ERROR_MESSAGES: Record<'past' | 'too_soon', string> = {
  past: 'Это время уже прошло — выберите другое',
  too_soon: `Поездку можно создать не позже чем за ${MIN_LEAD_MINUTES} минут до выезда`,
};

/** Форматирует Date в локальную YYYY-MM-DD (без конвертации в UTC). */
export function localDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Слово дня для выбранной даты поиска. Значений всего два — сегодня/завтра
 * (переключатель даты, issue #441), поэтому всё, что не сегодня, считаем «Завтра».
 */
export function dayWord(dateStr: string): 'Сегодня' | 'Завтра' {
  return dateStr === localDateStr() ? 'Сегодня' : 'Завтра';
}

/**
 * Проверяет, что момент выезда (dateStr YYYY-MM-DD + timeStr HH:MM) не в
 * прошлом и наступает не раньше чем через MIN_LEAD_MINUTES от `now`.
 * Некорректный формат считается вне зоны ответственности этой функции —
 * возвращает null (форматную валидацию делают вызывающие).
 */
export function validateDeparture(
  dateStr: string,
  timeStr: string,
  now: Date = new Date()
): DepartureValidation {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  const departure = new Date(year, month - 1, day, hour, minute, 0, 0);
  const diffMs = departure.getTime() - now.getTime();

  if (diffMs < 0) return 'past';
  if (diffMs < MIN_LEAD_MINUTES * 60 * 1000) return 'too_soon';
  return null;
}
