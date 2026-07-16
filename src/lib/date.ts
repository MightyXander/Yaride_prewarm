/**
 * Возвращает день недели на русском языке в именительном падеже.
 * @param date - дата, для которой берётся день недели (по умолчанию сегодня)
 * @returns День недели строчными буквами (например, 'понедельник', 'суббота')
 */
export function getCurrentWeekday(date: Date = new Date()): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'long' });
}

/**
 * Форматирует subtitle для главного экрана с днём недели выбранной даты.
 * @param timeRange - диапазон времени (например, 'утро 7:30–8:40')
 * @param updated - добавить ' · обновлено' в конец
 * @param date - дата, чей день недели показывать (по умолчанию сегодня)
 * @returns Отформатированная строка (например, 'суббота, утро 7:30–8:40')
 */
export function formatSubtitle(timeRange: string, updated: boolean = false, date?: Date): string {
  const weekday = getCurrentWeekday(date);
  const base = `${weekday}, ${timeRange}`;
  return updated ? `${base} · обновлено` : base;
}
