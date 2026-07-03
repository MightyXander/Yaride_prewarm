import { useId, useState } from 'react';
import { Icon } from './Icons';
import { ButtonSpinner } from './AuthKit';
import { hapticImpact } from '../lib/haptics';
import { ApiException } from '../lib/api';

interface ConsentGateProps {
  /** Async: компонент await'ит запись согласия на сервере; на ошибке показывает баннер. */
  onAccept: () => Promise<void>;
}

/**
 * ConsentGate — шаг согласия с Офертой и Политикой ПДн перед тем, как пустить
 * Telegram-юзера в Сервис (issue #234 — закрытие блокера 152-ФЗ: раньше JIT-профиль
 * Telegram-юзера создавался через ensureUser() БЕЗ фиксации согласия).
 *
 * Показывается IntroScreen'ом, когда GET /api/me/consent вернул версию согласия,
 * отличную от текущей (POLICY_VERSION/OFFER_VERSION), либо согласие ещё не
 * зафиксировано. Чекбокс — тот же визуальный паттерн, что и в RegisterScreen
 * (браузерная регистрация), самостоятельная копия: экраны не должны знать друг
 * о друге (issue #290).
 */
const ConsentGate: React.FC<ConsentGateProps> = ({ onAccept }) => {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const labelId = useId();

  const handleContinue = async () => {
    if (!checked || loading) return;
    setError(undefined);
    hapticImpact('light');
    setLoading(true);
    try {
      await onAccept();
      // Успех — IntroScreen переключает consentState и размонтирует этот компонент.
    } catch (e) {
      setError(
        e instanceof ApiException ? e.message : 'Не удалось сохранить согласие. Попробуйте ещё раз.',
      );
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '18px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <img
        src="/brand/icon-192.png"
        alt="поехали вместе"
        width={48}
        height={48}
        style={{ width: '48px', height: '48px', borderRadius: '13px', display: 'block', marginTop: '4px' }}
      />
      <div style={{ fontSize: '28px', lineHeight: 1.12, marginTop: '4px', fontWeight: 800, letterSpacing: '-0.01em' }}>
        Прежде чем начать
      </div>
      <div style={{ fontSize: '15px', marginTop: '-2px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
        Yaride — информационный сервис поиска попутчиков: мы не перевозчик и не
        назначаем цену поездки. Договорённость о поездке — всегда между вами и
        попутчиком.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-labelledby={labelId}
            onClick={() => setChecked((v) => !v)}
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
            onClick={() => setChecked((v) => !v)}
            style={{ fontSize: '13.5px', color: 'var(--foreground)', lineHeight: 1.45, cursor: 'pointer' }}
          >
            Я принимаю{' '}
            <a
              href="/offer"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--foreground)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              Оферту
            </a>{' '}
            и{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--foreground)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              Политику обработки ПДн
            </a>
          </span>
        </div>

        {error && (
          <div
            role="alert"
            style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--danger)', fontSize: '13px', fontWeight: 600, paddingLeft: '2px' }}
          >
            {error}
          </div>
        )}

        <button
          onClick={() => void handleContinue()}
          disabled={!checked || loading}
          className="focus-ring pressable"
          style={{
            minHeight: '52px',
            padding: '0 18px',
            borderRadius: '16px',
            background: checked ? 'var(--gradient-brand)' : 'var(--field)',
            color: checked ? 'var(--brand-foreground)' : 'var(--muted-foreground)',
            fontSize: '15px',
            fontWeight: 700,
            border: checked ? 'none' : '1.5px solid var(--field-border)',
            cursor: checked && !loading ? 'pointer' : 'default',
            fontFamily: 'var(--font-sans)',
            boxShadow: checked ? 'var(--shadow-hero)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'transform 0.08s ease, filter 0.12s ease',
          }}
        >
          {loading ? (
            <>
              <ButtonSpinner />
              Сохраняем…
            </>
          ) : (
            'Продолжить'
          )}
        </button>
      </div>
    </div>
  );
};

export default ConsentGate;
