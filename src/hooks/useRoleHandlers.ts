import { saveRole } from '../lib/role';
import type { UserRole } from '../lib/role';
import type { Screen } from '../types/navigation';

interface UseRoleHandlersArgs {
  setUserRole: (role: UserRole) => void;
  navigate: (screen: Screen) => void;
}

/** Хендлеры выбора роли: intro (пассажир/водитель) и апгрейд «стать водителем» из профиля. */
export function useRoleHandlers({ setUserRole, navigate }: UseRoleHandlersArgs) {
  // Обработка выбора роли на intro-экране
  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role);
    saveRole(role);
    navigate('main');
  };

  // Обработка «Стать водителем» из профиля
  const handleBecomeDriver = () => {
    setUserRole('driver');
    saveRole('driver');
    navigate('become-driver');
  };

  return { handleRoleSelect, handleBecomeDriver };
}
