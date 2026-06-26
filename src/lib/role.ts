/**
 * Управление ролью пользователя: passenger | driver
 * Роль сохраняется в localStorage для персистентности между запусками.
 */

export type UserRole = 'passenger' | 'driver';

const ROLE_KEY = 'yaride_role';

export function saveRole(role: UserRole): void {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // localStorage недоступен — игнорируем
  }
}

export function loadRole(): UserRole | null {
  try {
    const stored = localStorage.getItem(ROLE_KEY);
    if (stored === 'passenger' || stored === 'driver') {
      return stored;
    }
  } catch {
    // localStorage недоступен
  }
  return null;
}
