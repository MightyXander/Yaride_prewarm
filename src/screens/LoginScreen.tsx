import { useState } from 'react';
import Button from '../components/ui/Button';
import { BrandLogo, AuthField, PasswordField, ButtonSpinner, AuthError } from '../components/AuthKit';
import { hapticImpact } from '../lib/haptics';
import { ApiException } from '../lib/api';

/**
 * LoginScreen — вход по email для браузерных пользователей (без Telegram).
 * onSubmit — async: экран await'ит реальный вызов авторизации, на ошибке
 * показывает сообщение и СБРАСЫВАЕТ loading (кнопка не залипает «Входим…»).
 */
interface LoginScreenProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onRegister: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginScreen: React.FC<LoginScreenProps> = ({ onSubmit, onRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    setFormError(undefined);

    // Локальная валидация.
    let valid = true;
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Введите корректный email');
      valid = false;
    } else {
      setEmailError(undefined);
    }
    if (password.length === 0) {
      setPasswordError('Введите пароль');
      valid = false;
    } else {
      setPasswordError(undefined);
    }
    if (!valid) return;

    hapticImpact('light');
    setLoading(true);
    try {
      await onSubmit(email.trim(), password);
      // Успех — App уводит на следующий экран (компонент размонтируется).
    } catch (e) {
      // Ошибка backend: показываем сообщение и СБРАСЫВАЕМ loading.
      const message =
        e instanceof ApiException ? e.message : 'Не удалось войти. Попробуйте ещё раз.';
      setFormError(message);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: '18px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
      }}
    >
      <BrandLogo />

      <div>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em' }}>С возвращением</h1>
        <p style={{ margin: '9px 0 0', fontSize: '15px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Войдите, чтобы продолжить поездки
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <AuthField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Введите email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (emailError) setEmailError(undefined);
          }}
          error={emailError}
          autoFocus
        />
        <PasswordField
          label="Пароль"
          autoComplete="current-password"
          placeholder="Введите пароль"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(undefined);
          }}
          error={passwordError}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {formError && <AuthError>{formError}</AuthError>}
        <Button
          variant="primary"
          haptic="none"
          disabled={loading}
          onClick={() => void handleSubmit()}
          style={{ height: '54px', borderRadius: '16px', fontSize: '16px', fontWeight: 700 }}
        >
          {loading ? (
            <>
              <ButtonSpinner />
              Входим…
            </>
          ) : (
            'Войти'
          )}
        </Button>
      </div>

      <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--muted-foreground)', paddingTop: '2px' }}>
        Нет аккаунта?{' '}
        <button
          type="button"
          onClick={onRegister}
          className="focus-ring"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--foreground)',
            fontWeight: 700,
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            padding: '2px 4px',
            borderRadius: '8px',
          }}
        >
          Зарегистрироваться
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;
