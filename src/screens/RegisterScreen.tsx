import { useId, useState } from 'react';
import Button from '../components/ui/Button';
import { Icon } from '../components/Icons';
import {
  BrandLogo,
  AuthField,
  PasswordField,
  ButtonSpinner,
  AuthError,
  authLabelStyle,
} from '../components/AuthKit';
import { hapticImpact } from '../lib/haptics';
import { ApiException } from '../lib/api';
import GenderSelect from '../components/ui/GenderSelect';

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
  /** Пол (issue #447): обязателен, только male/female. */
  sex: 'male' | 'female';
  /** Дата рождения (issue #456): YYYY-MM-DD, необязательна при регистрации. */
  birthDate?: string;
  /** Согласие на новости и акции (необязательное). */
  news: boolean;
}

interface RegisterScreenProps {
  /** async: экран await'ит реальную регистрацию; на ошибке сбрасывает loading. */
  onSubmit: (payload: RegisterPayload) => Promise<void>;
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
  const [sex, setSex] = useState<'' | 'male' | 'female'>('');
  const [birthDate, setBirthDate] = useState('');
  const birthDateId = useId();

  const [usernameError, setUsernameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [firstNameError, setFirstNameError] = useState<string | undefined>();
  const [lastNameError, setLastNameError] = useState<string | undefined>();
  const [sexError, setSexError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading || !consent) return;
    setFormError(undefined);

    // Локальная валидация.
    let valid = true;
    if (firstName.trim() === '') {
      setFirstNameError('Укажите имя');
      valid = false;
    } else {
      setFirstNameError(undefined);
    }
    if (lastName.trim() === '') {
      setLastNameError('Укажите фамилию');
      valid = false;
    } else {
      setLastNameError(undefined);
    }
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
    if (sex === '') {
      setSexError('Укажите пол');
      valid = false;
    } else {
      setSexError(undefined);
    }
    if (!valid) return;

    hapticImpact('light');
    setLoading(true);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        sex: sex as 'male' | 'female',
        birthDate: birthDate || undefined,
        news,
      });
      // Успех — App уводит дальше (компонент размонтируется).
    } catch (e) {
      // Конфликты email/username мапим в соответствующие поля; иначе общий баннер.
      // Backend отдаёт машинно-различимый code (email_taken | username_taken).
      const code = e instanceof ApiException ? (e.details?.code as string | undefined) : undefined;
      if (code === 'email_taken') {
        setEmailError('Такой email уже зарегистрирован');
      } else if (code === 'username_taken') {
        setUsernameError('Этот ник уже занят');
      } else {
        setFormError(
          e instanceof ApiException ? e.message : 'Не удалось создать аккаунт. Попробуйте ещё раз.',
        );
      }
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
              onChange={(v) => {
                setFirstName(v);
                if (firstNameError) setFirstNameError(undefined);
              }}
              error={firstNameError}
            />
          </div>
          <div style={{ flex: 1 }}>
            <AuthField
              label="Фамилия"
              autoComplete="family-name"
              placeholder="Фамилия"
              value={lastName}
              onChange={(v) => {
                setLastName(v);
                if (lastNameError) setLastNameError(undefined);
              }}
              error={lastNameError}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <label htmlFor={birthDateId} style={authLabelStyle}>Дата рождения</label>
          <input
            id={birthDateId}
            className="focus-ring"
            type="date"
            autoComplete="bday"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthDate(e.target.value)}
            style={{
              height: '52px',
              borderRadius: '14px',
              border: '1.5px solid var(--field-border)',
              background: 'var(--field)',
              color: 'var(--foreground)',
              padding: '0 16px',
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <GenderSelect
          value={sex}
          onChange={(v) => {
            setSex(v);
            setSexError(undefined);
          }}
          hint="Нужно для режима женских поездок — женщины смогут ехать только с женщинами."
          error={sexError}
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

      {formError && <AuthError>{formError}</AuthError>}

      <Button
        variant="primary"
        haptic="none"
        disabled={!consent || loading}
        onClick={() => void handleSubmit()}
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
