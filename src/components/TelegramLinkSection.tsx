import { useEffect, useState } from 'react';
import Card from './ui/Card';
import { Icon } from './Icons';
import { AuthError } from './AuthKit';
import { createTelegramLinkToken, ApiException } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';
import { usePollingRefetch } from '../hooks/useRefetchOnFocus';
import { isTelegramContext } from '../lib/auth';
import { hapticImpact, hapticNotify } from '../lib/haptics';

/**
 * TelegramLinkSection — бейдж «Подключить Telegram» в профиле (issue #401).
 *
 * Два состояния:
 *  - НЕ привязан: акцентная CTA-карточка (тап по всей карточке) — запрашивает
 *    одноразовый токен, открывает `t.me/<бот>?start=link_<токен>` в новой
 *    вкладке/приложении Telegram, затем поллит профиль до tg_linked===true.
 *  - Привязан: success-карточка в том же визуальном языке, что и
 *    EmailLoginSection (36px тинт-иконка + чек, заголовок + подпись).
 *
 * Внутри Telegram-контекста показывается СРАЗУ «подключён» без похода в сеть —
 * по определению контекста запуска аккаунт уже связан с tg_user_id (решённая
 * развилка спеки, см. issue #401).
 */

// Поллинг профиля после выдачи ссылки: раз в 3с, не дольше 2 минут — юзер
// успевает переключиться в Telegram, дойти до /start и вернуться.
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 2 * 60 * 1000;

// Мини-спиннер в правом слоте карточки на время запроса токена. НЕ переиспользует
// AuthKit.ButtonSpinner — тот раскрашен под var(--brand-foreground) для контраста
// ВНУТРИ жёлтой градиентной кнопки, а здесь спиннер сидит на нейтральной
// поверхности карточки (в тёмной теме он был бы почти не виден). Использует тот
// же keyframe ya-auth-spin (index.css), что и ButtonSpinner.
const AffordanceSpinner: React.FC = () => (
  <span
    aria-hidden
    style={{
      width: '16px',
      height: '16px',
      borderRadius: '50%',
      border: '2px solid color-mix(in srgb, var(--muted-foreground) 25%, transparent)',
      borderTopColor: 'var(--muted-foreground)',
      animation: 'ya-auth-spin 0.7s linear infinite',
    }}
  />
);

const TelegramLinkSection: React.FC = () => {
  const { profile, refetch } = useProfile();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [awaitingLink, setAwaitingLink] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);

  const inTelegram = isTelegramContext();
  const linked = inTelegram || profile?.tg_linked === true;

  // Поллинг активен, только пока ждём подтверждения и ещё не привязано.
  // usePollingRefetch сам приостанавливается, когда вкладка скрыта, и
  // возобновляется при возврате — плюс штатный refetch-on-focus в
  // ProfileContext уже подхватит tg_linked раньше тика, если юзер вернулся
  // во вкладку до следующего интервала.
  usePollingRefetch(
    () => {
      if (deadline !== null && Date.now() > deadline) {
        setAwaitingLink(false);
        return;
      }
      void refetch();
    },
    POLL_INTERVAL_MS,
    awaitingLink && !linked,
  );

  // Успешный переход CTA → «подключён»: тактильное подтверждение один раз.
  useEffect(() => {
    if (awaitingLink && linked) {
      hapticNotify('success');
      setAwaitingLink(false);
    }
  }, [awaitingLink, linked]);

  // Вне Telegram профиль ещё не загружен — не знаем tg_linked, ничего не
  // показываем (не мигаем неверным состоянием). Внутри Telegram решение не
  // зависит от профиля — рендерим сразу.
  if (!inTelegram && !profile) {
    return null;
  }

  const handleClick = async () => {
    if (loading || linked) {
      return;
    }
    setError(undefined);
    hapticImpact('light');
    setLoading(true);
    try {
      const res = await createTelegramLinkToken();
      window.open(res.url, '_blank', 'noopener,noreferrer');
      setDeadline(Date.now() + POLL_MAX_MS);
      setAwaitingLink(true);
    } catch (e) {
      const code = e instanceof ApiException ? (e.details?.code as string | undefined) : undefined;
      if (code === 'too_many_attempts') {
        setError('Слишком много попыток. Попробуйте позже.');
      } else {
        setError(
          e instanceof ApiException ? e.message : 'Не удалось получить ссылку. Попробуйте ещё раз.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (linked) {
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
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Telegram подключён</div>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.45 }}>
            Уведомления о поездках и бронях приходят в бот.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Card
        role="button"
        tabIndex={0}
        aria-label="Подключить Telegram — уведомления о поездках и бронях"
        className="focus-ring pressable"
        onClick={() => void handleClick()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void handleClick();
          }
        }}
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          padding: '16px',
          cursor: loading ? 'default' : 'pointer',
          // Тонкий бренд-тинт бордера — тот же формульный приём, что у
          // TelegramButton в AuthKit.tsx (color-mix от var(--brand)), чуть
          // мягче (смешан с var(--border)), чтобы карточка не «кричала» рядом
          // с нейтральным меню профиля, но заметно отличалась от него.
          border: '1px solid color-mix(in srgb, var(--brand) 35%, var(--border))',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '12px',
            background: 'color-mix(in srgb, var(--brand) 18%, transparent)',
            color: 'var(--brand-dark)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon id="i-telegram" fill style={{ width: '18px', height: '18px' }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Подключите Telegram</div>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.4 }}>
            Уведомления о поездках и бронях. Управление из бота.
          </div>
        </div>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: '20px',
            height: '20px',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--muted-foreground)',
          }}
        >
          {loading ? <AffordanceSpinner /> : <Icon id="i-chev-r" style={{ width: '18px', height: '18px' }} />}
        </span>
      </Card>
      {error && (
        <div style={{ marginTop: '8px' }}>
          <AuthError>{error}</AuthError>
        </div>
      )}
    </div>
  );
};

export default TelegramLinkSection;
