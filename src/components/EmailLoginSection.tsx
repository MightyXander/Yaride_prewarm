import { useEffect, useState } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { Icon } from './Icons';
import { AuthField, PasswordField, ButtonSpinner, AuthError } from './AuthKit';
import { getMyCredentials, addMyCredentials, linkMyAccount, ApiException } from '../lib/api';
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

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Пауза перед раскрытием: даём профилю отрисоваться, чтобы секция не «прыгала» поверх.
const REVEAL_DELAY_MS = 450;
// Единый «язык» движения (та же ease-out, что у Appear/Select).
const EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

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
  const [linkedDone, setLinkedDone] = useState(false);

  // Режим секции: создать новый вход по email ИЛИ привязать уже существующую
  // браузерную учётку к этой TG-карточке (issue #300, лечит/предотвращает дубли).
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkError, setLinkError] = useState<string | undefined>();
  const [linkLoading, setLinkLoading] = useState(false);

  // Двухступенчатое раскрытие без рывка:
  //  mounted — секция появилась в DOM (после паузы REVEAL_DELAY_MS, чтобы профиль
  //            успел отрисоваться и блок не «прыгал» поверх);
  //  open    — запускает CSS-переход grid-template-rows 0fr→1fr (+ fade/slide) на
  //            следующем кадре после маунта, чтобы переход реально проиграл.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

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

  const handleLink = async () => {
    if (linkLoading) return;
    setLinkError(undefined);
    const em = linkEmail.trim();
    if (!EMAIL_RE.test(em)) {
      setLinkError('Введите корректный email');
      return;
    }
    if (linkPassword.length === 0) {
      setLinkError('Введите пароль');
      return;
    }
    hapticImpact('light');
    setLinkLoading(true);
    try {
      const res = await linkMyAccount({ email: em, password: linkPassword });
      hapticNotify('success');
      setLinkedDone(true);
      setDoneEmail(res.email);
    } catch (e) {
      const code = e instanceof ApiException ? (e.details?.code as string | undefined) : undefined;
      if (code === 'invalid_credentials') {
        setLinkError('Неверный email или пароль');
      } else if (code === 'other_telegram') {
        setLinkError('Этот email привязан к другому Telegram-аккаунту');
      } else if (code === 'same_account') {
        setLinkError('Этот аккаунт уже привязан к вашему профилю');
      } else {
        setLinkError(e instanceof ApiException ? e.message : 'Не удалось привязать аккаунт. Попробуйте ещё раз.');
      }
      setLinkLoading(false);
    }
  };

  // До завершения проверки статуса или вне области применения — блока нет в DOM.
  const shouldShow = checked && visible;

  // Пауза перед появлением, затем маунт. При reduced-motion — сразу, без задержки.
  useEffect(() => {
    if (!shouldShow) {
      setMounted(false);
      setOpen(false);
      return;
    }
    if (prefersReducedMotion) {
      setMounted(true);
      setOpen(true);
      return;
    }
    const t = setTimeout(() => setMounted(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [shouldShow]);

  // После маунта — на следующем кадре запускаем раскрытие (даём браузеру
  // зафиксировать стартовое состояние 0fr, иначе перехода не будет — резкий скачок).
  useEffect(() => {
    if (!mounted || prefersReducedMotion) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    return () => cancelAnimationFrame(r);
  }, [mounted]);

  // Успех: подтверждаем результат и каким email теперь можно входить из браузера.
  const body = doneEmail ? (
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
          <div style={{ fontSize: '15px', fontWeight: 700 }}>
            {linkedDone ? 'Аккаунт привязан' : 'Вход по email включён'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.45 }}>
            {linkedDone ? (
              <>
                Браузерная учётка{' '}
                <span style={{ color: 'var(--foreground)', fontWeight: 600, wordBreak: 'break-all' }}>{doneEmail}</span>{' '}
                теперь связана с этим профилем — поездки и рейтинг объединены в одной карточке.
              </>
            ) : (
              <>
                Теперь в браузер можно войти по{' '}
                <span style={{ color: 'var(--foreground)', fontWeight: 600, wordBreak: 'break-all' }}>{doneEmail}</span>{' '}
                и тому же паролю. Это та же карточка — поездки и рейтинг общие.
              </>
            )}
          </div>
        </div>
      </Card>
  ) : mode === 'link' ? (
    <Card style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em' }}>Привязать аккаунт</h2>
        <p style={{ margin: '5px 0 0', fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
          Уже регистрировались в браузере? Войдите — привяжем ту учётку к этому профилю, история объединится в одной карточке.
        </p>
      </div>

      <AuthField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="Email браузерной учётки"
        value={linkEmail}
        onChange={(v) => {
          setLinkEmail(v);
          if (linkError) setLinkError(undefined);
        }}
      />

      <PasswordField
        label="Пароль"
        autoComplete="current-password"
        placeholder="Пароль от браузерного входа"
        value={linkPassword}
        onChange={(v) => {
          setLinkPassword(v);
          if (linkError) setLinkError(undefined);
        }}
      />

      {linkError && <AuthError>{linkError}</AuthError>}

      <Button
        variant="primary"
        haptic="none"
        disabled={linkLoading}
        onClick={() => void handleLink()}
        style={{ height: '52px', borderRadius: '16px', fontSize: '15px', fontWeight: 700 }}
      >
        {linkLoading ? (
          <>
            <ButtonSpinner />
            Привязываем…
          </>
        ) : (
          'Привязать аккаунт'
        )}
      </Button>

      <button
        type="button"
        onClick={() => { setMode('create'); setLinkError(undefined); }}
        style={{
          background: 'none', border: 'none', padding: '2px', cursor: 'pointer', alignSelf: 'center',
          color: 'var(--muted-foreground)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-sans)',
        }}
      >
        Создать новый вход по email
      </button>
    </Card>
  ) : (
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

      <button
        type="button"
        onClick={() => { setMode('link'); setFormError(undefined); }}
        style={{
          background: 'none', border: 'none', padding: '2px', cursor: 'pointer', alignSelf: 'center',
          color: 'var(--muted-foreground)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-sans)',
        }}
      >
        Уже регистрировались в браузере? Привязать аккаунт
      </button>
    </Card>
  );

  // До паузы/маунта — блока нет в DOM (не занимает место, не даёт лишний gap).
  if (!shouldShow || !mounted) return null;

  // Плавное раскрытие «как у выпадающего списка»: grid-template-rows 0fr→1fr
  // (компонентный переход высоты, без measure-jump как у height:auto) + лёгкий
  // fade и подъём. Внутренний overflow:hidden держим ПОСТОЯННО — переключение
  // hidden↔visible по концу перехода вызывало смену BFC/схлопывание margin и
  // резкий скачок блока вверх в самом конце раскрытия. Чтобы мягкая тень карточки
  // при этом не обрезалась снизу — даём клип-слою paddingBottom под тень и гасим
  // лишний отступ отрицательным marginBottom (визуальная геометрия не меняется).
  const reduce = prefersReducedMotion;
  const SHADOW_ROOM = 20;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: reduce || open ? '1fr' : '0fr',
        opacity: reduce || open ? 1 : 0,
        transform: reduce ? 'none' : open ? 'translateY(0)' : 'translateY(-6px)',
        transition: reduce
          ? 'none'
          : `grid-template-rows 340ms ${EASE}, opacity 260ms ${EASE}, transform 340ms ${EASE}`,
        willChange: reduce ? 'auto' : 'grid-template-rows, opacity, transform',
      }}
    >
      <div
        style={{
          overflow: 'hidden',
          minHeight: 0,
          paddingBottom: `${SHADOW_ROOM}px`,
          marginBottom: `-${SHADOW_ROOM}px`,
        }}
      >
        {body}
      </div>
    </div>
  );
};

export default EmailLoginSection;
