import { useId, useState } from 'react';
import Button from '../components/ui/Button';
import { Icon } from '../components/Icons';
import {
  BrandLogo,
  AuthField,
  PasswordField,
  ButtonSpinner,
} from '../components/AuthKit';
import { hapticImpact } from '../lib/haptics';

/**
 * RegisterScreen — создание аккаунта для браузерных пользователей (без Telegram).
 * Презентационный: реальная регистрация замокана через props.onSubmit.
 */
export interface RegisterPayload {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  /** Согласие на новости и акции (необязательное). */
  news: boolean;
}

interface RegisterScreenProps {
  onSubmit: (payload: RegisterPayload) => void;
  onLogin: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

/* Чекбокс: квадрат-галочка + кликабельный лейбл. Доступен с клавиатуры. */
interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const Checkbox: React.FC<CheckboxProps> = ({ checked, onToggle, children }) => {
  const labelId = useId();
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={onToggle}
        className="focus-ring pressable"
        style={{
          width: '24px',
          height: '24px',
          flex: '0 0 auto',
          marginTop: '1px',
          borderRadius: '7px',
          border: `1.5px solid ${checked ? 'var(--brand)' : 'var(--field-border)'}`,
          background: checked ? 'var(--brand)' : 'var(--field)',
          color: 'var(--brand-foreground)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {checked && <Icon id="i-check" style={{ width: '14px', height: '14px', strokeWidth: 2.8 }} />}
      </button>
      <span
        id={labelId}
        onClick={onToggle}
        style={{ fontSize: '13.5px', color: 'var(--foreground)', lineHeight: 1.45, cursor: 'pointer' }}
      >
        {children}
      </span>
    </div>
  );
};

const RegisterScreen: React.FC<RegisterScreenProps> = ({ onSubmit, onLogin }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [news, setNews] = useState(false);

  const [usernameError, setUsernameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (loading || !consent) return;

    // Локальная валидация (без backend).
    let valid = true;
    if (!USERNAME_RE.test(username.trim())) {
      setUsernameError('Только латиница, цифры и _');
      valid = false;
    } else {
      setUsernameError(undefined);
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Введите корректный email');
      valid = false;
    } else {
      setEmailError(undefined);
    }
    if (password.length < 8) {
      setPasswordError('Минимум 8 символов');
      valid = false;
    } else {
      setPasswordError(undefined);
    }
    if (!valid) return;

    hapticImpact('light');
    setLoading(true);
    // МОК: имитируем сетевую задержку для состояния загрузки кнопки.
    // TODO: заменить на реальный вызов регистрации; ошибку «email занят» с backend
    //       мапить в setEmailError('Такой email уже зарегистрирован').
    setTimeout(() => {
      onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        news,
      });
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
        gap: '18px',
      }}
    >
      <BrandLogo />

      <div>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em' }}>Создать аккаунт</h1>
        <p style={{ margin: '9px 0 0', fontSize: '15px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Пара минут — и можно искать попутчиков
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <AuthField
              label="Имя"
              autoComplete="given-name"
              placeholder="Имя"
              value={firstName}
              onChange={setFirstName}
            />
          </div>
          <div style={{ flex: 1 }}>
            <AuthField
              label="Фамилия"
              autoComplete="family-name"
              placeholder="Фамилия"
              value={lastName}
              onChange={setLastName}
            />
          </div>
        </div>

        <AuthField
          label="Ник"
          autoComplete="username"
          placeholder="username"
          prefix="@"
          hint="Латиница, цифры и _"
          value={username}
          onChange={(v) => {
            setUsername(v);
            if (usernameError) setUsernameError(undefined);
          }}
          error={usernameError}
        />

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
        />

        <PasswordField
          label="Пароль"
          autoComplete="new-password"
          placeholder="Придумайте пароль"
          hint="Минимум 8 символов"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError(undefined);
          }}
          error={passwordError}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '2px' }}>
        <Checkbox checked={consent} onToggle={() => setConsent((v) => !v)}>
          Я согласен на обработку персональных данных в соответствии с{' '}
          <a
            href="/privacy"
            onClick={(e) => e.stopPropagation()}
            style={{ color: 'var(--foreground)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            Политикой конфиденциальности
          </a>
        </Checkbox>
        <Checkbox checked={news} onToggle={() => setNews((v) => !v)}>
          Хочу получать новости и акции
        </Checkbox>
      </div>

      <Button
        variant="primary"
        haptic="none"
        disabled={!consent || loading}
        onClick={handleSubmit}
        style={
          consent
            ? { height: '54px', borderRadius: '16px', fontSize: '16px', fontWeight: 700 }
            : {
                height: '54px',
                borderRadius: '16px',
                fontSize: '16px',
                fontWeight: 700,
                background: 'var(--field)',
                color: 'var(--muted-foreground)',
                border: '1.5px solid var(--field-border)',
                boxShadow: 'none',
                opacity: 1,
              }
        }
      >
        {loading ? (
          <>
            <ButtonSpinner />
            Создаём…
          </>
        ) : (
          'Зарегистрироваться'
        )}
      </Button>

      <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--muted-foreground)' }}>
        Уже есть аккаунт?{' '}
        <button
          type="button"
          onClick={onLogin}
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
          Войти
        </button>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '12.5px',
          color: 'var(--muted-foreground)',
          lineHeight: 1.5,
          textAlign: 'center',
        }}
      >
        Водительские данные добавите после регистрации
      </p>
    </div>
  );
};

export default RegisterScreen;
