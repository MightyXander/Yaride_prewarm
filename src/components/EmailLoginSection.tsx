import { useEffect, useState } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { Icon } from './Icons';
import { AuthField, PasswordField, ButtonSpinner, AuthError } from './AuthKit';
import { getMyCredentials, addMyCredentials, ApiException } from '../lib/api';
import { isTelegramContext } from '../lib/auth';
import { hapticImpact, hapticNotify } from '../lib/haptics';

/**
 * EmailLoginSection — секция профиля «Вход по email» (issue #273, TG→браузер).
 *
 * Показывается ТОЛЬКО в Telegram-контексте и ТОЛЬКО аккаунту без пароля: даёт
 * добавить email+ник+пароль к СВОЕЙ существующей users-карточке, чтобы потом
 * входить и из браузера тем же email (единая карточка — рейтинг/поездки общие).
 *
 * Переиспользует AuthKit (AuthField/PasswordField/AuthError/ButtonSpinner) и
 * ui/Card+Button — без дублей и новых зависимостей. Только inline-стили + токены.
 */

// Те же правила, что при регистрации (RegisterScreen) и на бэке (auth.ts).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

const EmailLoginSection: React.FC = () => {
  // Решение о видимости принимаем после загрузки статуса, чтобы секция не «мигала».
  const [checked, setChecked] = useState(false);
  const [visible, setVisible] = useState(false);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [emailError, setEmailError] = useState<string | undefined>();
  const [usernameError, setUsernameError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  const [loading, setLoading] = useState(false);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  useEffect(() => {
    // Вне Telegram секция не нужна: браузерные аккаунты уже входят по email.
    if (!isTelegramContext()) {
      setChecked(true);
      return;
    }
    let alive = true;
    getMyCredentials()
      .then((c) => {
        if (!alive) return;
        if (!c.hasPassword) {
          setVisible(true);
          // Префилл ника из текущего снимка users.username (если есть).
          if (c.username) setUsername(c.username);
        }
      })
      .catch(() => {
        // Нет профиля / 401 — секцию просто не показываем (не блокируем профиль).
      })
      .finally(() => {
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (loading) return;
    setFormError(undefined);

    // Локальная валидация (как в RegisterScreen) — ошибки под соответствующими полями.
    let valid = true;
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Введите корректный email');
      valid = false;
    } else {
      setEmailError(undefined);
    }
    if (!USERNAME_RE.test(username.trim())) {
      setUsernameError('Только латиница, цифры и _');
      valid = false;
    } else {
      setUsernameError(undefined);
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
    try {
      const res = await addMyCredentials({
        email: email.trim(),
        username: username.trim(),
        password,
      });
      hapticNotify('success');
      setDoneEmail(res.user.email ?? email.trim());
    } catch (e) {
      const code = e instanceof ApiException ? (e.details?.code as string | undefined) : undefined;
      if (code === 'email_taken') {
        setEmailError('Такой email уже зарегистрирован');
      } else if (code === 'username_taken') {
        setUsernameError('Этот ник уже занят');
      } else if (code === 'already_set') {
        setFormError('Для этого аккаунта вход по email уже настроен.');
      } else {
        setFormError(
          e instanceof ApiException ? e.message : 'Не удалось включить вход по email. Попробуйте ещё раз.',
        );
      }
      setLoading(false);
    }
  };

  // До завершения проверки статуса или вне области применения — ничего не рисуем.
  if (!checked || !visible) return null;

  // Успех: подтверждаем результат и каким email теперь можно входить из браузера.
  if (doneEmail) {
    return (
      <Card
        role="status"
        aria-live="polite"
        style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px' }}
      >
        <span
          aria-hidden
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '12px',
            background: 'color-mix(in srgb, var(--success) 16%, transparent)',
            color: 'var(--success)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon id="i-check" style={{ width: '18px', height: '18px', strokeWidth: 2.6 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Вход по email включён</div>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.45 }}>
            Теперь в браузер можно войти по{' '}
            <span style={{ color: 'var(--foreground)', fontWeight: 600, wordBreak: 'break-all' }}>{doneEmail}</span>{' '}
            и тому же паролю. Это та же карточка — поездки и рейтинг общие.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em' }}>Вход по email</h2>
        <p style={{ margin: '5px 0 0', fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
          Добавьте email и пароль, чтобы заходить в тот же аккаунт из браузера. Поездки и рейтинг останутся общими.
        </p>
      </div>

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
          if (formError) setFormError(undefined);
        }}
        error={emailError}
      />

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
          if (formError) setFormError(undefined);
        }}
        error={usernameError}
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
          if (formError) setFormError(undefined);
        }}
        error={passwordError}
      />

      {formError && <AuthError>{formError}</AuthError>}

      <Button
        variant="primary"
        haptic="none"
        disabled={loading}
        onClick={() => void handleSubmit()}
        style={{ height: '52px', borderRadius: '16px', fontSize: '15px', fontWeight: 700 }}
      >
        {loading ? (
          <>
            <ButtonSpinner />
            Включаем…
          </>
        ) : (
          'Включить вход по email'
        )}
      </Button>
    </Card>
  );
};

export default EmailLoginSection;
