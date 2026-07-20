import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getMe, loginUser, logoutUser, registerUser } from '../lib/api';
import { POLICY_VERSION } from '../lib/policy';
import type { UserRole } from '../lib/role';
import type { RegisterPayload } from '../screens/RegisterScreen';
import type { Screen } from '../types/navigation';

interface UseAuthHandlersArgs {
  gateContext: boolean;
  userRole: UserRole | null;
  navigate: (screen: Screen) => void;
  setAuthed: Dispatch<SetStateAction<boolean>>;
  setMeChecked: Dispatch<SetStateAction<boolean>>;
}

/**
 * Браузерная авторизация (#242): хендлеры login/register/logout
 * + проверка серверной сессии (GET /api/auth/me) при старте. Состояние authed/meChecked
 * живёт в App.tsx (нужно ещё до useNavigation для расчёта initialScreen), сюда
 * вынесена только сама логика (issue #290).
 */
export function useAuthHandlers({ gateContext, userRole, navigate, setAuthed, setMeChecked }: UseAuthHandlersArgs) {
  // Куда вести после успешного входа: роль есть → main, нет → intro (как обычный старт).
  const afterAuth = () => {
    navigate(userRole ? 'main' : 'intro');
  };

  // Вход по email: реальный вызов API. Ошибки/loading обрабатывает LoginScreen
  // (контракт onSubmit — async; экран await'ит и на ошибке сбрасывает loading).
  const handleAuthLogin = async (email: string, password: string) => {
    await loginUser({ email, password });
    setAuthed(true);
    afterAuth();
  };

  // Регистрация: реальный вызов API. Версия политики — единый источник POLICY_VERSION.
  // marketingConsent пишем только если пользователь отметил «новости и акции».
  const handleAuthRegister = async (payload: RegisterPayload) => {
    await registerUser({
      email: payload.email,
      password: payload.password,
      username: payload.username,
      firstName: payload.firstName,
      lastName: payload.lastName,
      sex: payload.sex,
      birthDate: payload.birthDate,
      pdnConsent: true,
      pdnConsentVersion: POLICY_VERSION,
      marketingConsent: payload.news,
      marketingConsentVersion: payload.news ? POLICY_VERSION : undefined,
    });
    setAuthed(true);
    afterAuth();
  };

  // Выход: рвём серверную сессию, сбрасываем флаг, возвращаемся на гейт.
  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      /* даже при ошибке сети уводим пользователя на гейт */
    }
    setAuthed(false);
    navigate('auth-gate');
  };

  // При старте в браузере проверяем серверную сессию (GET /api/auth/me).
  // Успех → считаем вошедшим и уводим с гейта; 401 → остаёмся на гейте.
  useEffect(() => {
    if (!gateContext) return;
    let cancelled = false;
    getMe()
      .then(() => {
        if (cancelled) return;
        setAuthed(true);
        navigate(userRole ? 'main' : 'intro');
      })
      .catch(() => {
        /* нет сессии — гейт остаётся */
      })
      .finally(() => {
        if (!cancelled) setMeChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // Один раз при маунте: проверка восстановления сессии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { handleAuthLogin, handleAuthRegister, handleLogout };
}
