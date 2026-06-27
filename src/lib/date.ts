/**
 * Возвращает текущий день недели на русском языке в именительном падеже.
 * @returns День недели строчными буквами (например, 'понедельник', 'суббота')
 */
export function getCurrentWeekday(): string {
  return new Date().toLocaleDateString('ru-RU', { weekday: 'long' });
}

/**
 * Форматирует subtitle для главного экрана с текущим днём недели.
 * @param timeRange - диапазон времени (например, 'утро 7:30–8:40')
 * @param updated - добавить ' · обновлено' в конец
 * @returns Отформатированная строка (например, 'суббота, утро 7:30–8:40')
 */
export function formatSubtitle(timeRange: string, updated: boolean = false): string {
  const weekday = getCurrentWeekday();
  const base = `${weekday}, ${timeRange}`;
  return updated ? `${base} · обновлено` : base;
}
