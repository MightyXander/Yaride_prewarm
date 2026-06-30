import { useState } from 'react';
import Button from '../components/ui/Button';
import {
  BrandLogo,
  AuthField,
  PasswordField,
  TelegramButton,
  ButtonSpinner,
} from '../components/AuthKit';
import { hapticImpact } from '../lib/haptics';

/**
 * LoginScreen — вход по email для браузерных пользователей (без Telegram).
 * Презентационный: реальная авторизация замокана через props.onSubmit.
 */
interface LoginScreenProps {
  onSubmit: (email: string, password: string) => void;
  onTelegram: () => void;
  onRegister: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginScreen: React.FC<LoginScreenProps> = ({ onSubmit, onTelegram, onRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (loading) return;

    // Локальная валидация (без backend).
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
    // МОК: имитируем сетевую задержку, чтобы показать состояние загрузки кнопки.
    // TODO: заменить на реальный вызов авторизации, когда подключим backend.
    setTimeout(() => {
      onSubmit(email.trim(), password);
    }, 600);
  };

  return (
    <div
      style={{
        flex: 1,
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
        <Button
          variant="primary"
          haptic="none"
          disabled={loading}
          onClick={handleSubmit}
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
        <TelegramButton onClick={onTelegram} />
      </div>

      {/* Восстановления по почте намеренно нет — только через Telegram. */}
      <button
        type="button"
        onClick={onTelegram}
        className="focus-ring"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: '13.5px',
          color: 'var(--muted-foreground)',
          textAlign: 'center',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          padding: '4px',
          borderRadius: '8px',
        }}
      >
        Не помните пароль? Войдите через Telegram
      </button>

      <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--muted-foreground)', marginTop: 'auto', paddingTop: '6px' }}>
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
