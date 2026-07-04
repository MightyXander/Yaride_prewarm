import { useState, useEffect, useId, useCallback } from 'react';
import Button from './ui/Button';
import { Icon } from './Icons';
import { hapticNotify, hapticSelection } from '../lib/haptics';
import { showToast } from '../lib/toast';
import {
  getMyPhone,
  saveMyPhone,
  sendPhoneVerificationCode,
  verifyPhoneCode,
  ApiException,
} from '../lib/api';

/**
 * Сбор номера телефона «по требованию» (issue #267).
 *
 * Переиспользуемый блок: префилл из users.phone, реальный ввод РФ-номера и
 * сохранение в профиль ПЕРЕД целевым действием (бронь пассажира / публикация
 * поездки водителем). Без SMS-верификации — она отложена.
 *
 * Готовность (телефон задан в профиле) сообщается наверх через onReadyChange,
 * чтобы экран мог разблокировать основную кнопку только когда номер сохранён.
 *
 * SMS-подтверждение (issue #328): блок «Подтвердить номер» показывается ТОЛЬКО
 * когда бэк вернул verificationEnabled=true (сконфигурированы креды SMSC.ru) —
 * до этого поведение не меняется, номер просто сохраняется без верификации.
 */

interface PhoneFieldProps {
  /** Подпись секции (по умолчанию «Телефон для связи»). */
  label?: string;
  /** Короткое пояснение, зачем нужен номер (контекст экрана). */
  hint?: string;
  /** Вызывается при изменении готовности: true, когда телефон сохранён в профиле. */
  onReadyChange?: (ready: boolean, phone: string | null) => void;
}

type Status = 'loading' | 'editing' | 'saving' | 'saved' | 'load-error';

/** Шаг SMS-подтверждения номера (issue #328), независим от Status выше. */
type CodeStep = 'idle' | 'awaiting-code' | 'sending' | 'verifying';

/**
 * Нормализация РФ-номера (зеркало серверной в api.ts): 8/+7/7 + 10 цифр,
 * код оператора «9» → +7XXXXXXXXXX, иначе null. Используется для локальной
 * валидации (активность кнопки), окончательную проверку делает сервер.
 */
function normalizeRuPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let national: string;
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  } else {
    return null;
  }
  if (national.length !== 10 || national[0] !== '9') {
    return null;
  }
  return `+7${national}`;
}

/** Человекочитаемый вид: +7XXXXXXXXXX → «+7 905 123-44-12». */
function formatPhoneDisplay(phone: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  if (!m) {
    return phone;
  }
  return `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}`;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  minHeight: '48px',
  padding: '0 16px',
  borderRadius: '18px',
  background: 'var(--field)',
  border: '1px solid var(--field-border)',
  boxShadow: 'var(--field-shadow)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '15px',
  fontWeight: 600,
  color: 'var(--foreground)',
};

const PhoneField: React.FC<PhoneFieldProps> = ({
  label = 'Телефон для связи',
  hint = 'Виден водителю/пассажиру этой поездки.',
  onReadyChange,
}) => {
  const [status, setStatus] = useState<Status>('loading');
  const [value, setValue] = useState<string>('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // SMS-подтверждение номера (issue #328).
  const [verified, setVerified] = useState(false);
  const [verificationEnabled, setVerificationEnabled] = useState(false);
  // Канал доставки кода (issue #328): определяет формулировку подсказки —
  // flash_call (звонок робота, код = последние 4 цифры) или sms (код в сообщении).
  const [channel, setChannel] = useState<'flash_call' | 'sms'>('flash_call');
  const [codeStep, setCodeStep] = useState<CodeStep>('idle');
  const [codeValue, setCodeValue] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const codeInputId = useId();
  const codeErrorId = useId();

  const emitReady = useCallback(
    (phone: string | null) => {
      onReadyChange?.(phone !== null, phone);
    },
    [onReadyChange],
  );

  // Префилл: тянем сохранённый телефон при монтировании.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyPhone();
        if (cancelled) return;
        setVerificationEnabled(res.verificationEnabled);
        setChannel(res.channel);
        setVerified(res.verified);
        if (res.phone) {
          setSaved(res.phone);
          setValue(formatPhoneDisplay(res.phone));
          setStatus('saved');
          emitReady(res.phone);
        } else {
          setStatus('editing');
          emitReady(null);
        }
      } catch (err) {
        if (cancelled) return;
        // 401 (нет авторизации) и прочее: даём ввести вручную, не блокируем экран жёстко.
        if (err instanceof ApiException && err.status === 401) {
          setStatus('editing');
        } else {
          setStatus('load-error');
        }
        emitReady(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emitReady]);

  const localValid = normalizeRuPhone(value) !== null;

  const handleSave = async () => {
    const normalized = normalizeRuPhone(value);
    if (normalized === null) {
      setError('Введите корректный российский номер: +7 9XX XXX-XX-XX');
      hapticNotify('error');
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      const res = await saveMyPhone({ phone: normalized });
      setSaved(res.phone);
      setValue(formatPhoneDisplay(res.phone));
      setStatus('saved');
      // Сервер сбрасывает phone_verified при смене номера (updateUserPhone) —
      // отражаем это сразу, не дожидаясь повторного GET /me/phone.
      setVerified(false);
      setCodeStep('idle');
      setCodeValue('');
      setCodeError(null);
      hapticNotify('success');
      emitReady(res.phone);
    } catch (err) {
      const message =
        err instanceof ApiException
          ? err.message
          : 'Не удалось сохранить номер. Попробуйте ещё раз.';
      setError(message);
      setStatus('editing');
      showToast(message);
      hapticNotify('error');
    }
  };

  const handleEdit = () => {
    hapticSelection();
    setStatus('editing');
    setError(null);
  };

  /** Запросить код подтверждения на сохранённый номер (issue #328). */
  const handleSendCode = async () => {
    if (saved === null) return;
    setCodeStep('sending');
    setCodeError(null);
    try {
      await sendPhoneVerificationCode({ phone: saved });
      setCodeStep('awaiting-code');
      setCodeValue('');
      hapticNotify('success');
    } catch (err) {
      const message =
        err instanceof ApiException
          ? err.message
          : 'Не удалось отправить код. Попробуйте ещё раз.';
      setCodeStep('idle');
      showToast(message);
      hapticNotify('error');
    }
  };

  /** Подтвердить введённый код (issue #328). */
  const handleVerifyCode = async () => {
    if (codeValue.trim() === '') {
      setCodeError('Введите код из звонка/SMS');
      hapticNotify('error');
      return;
    }
    setCodeStep('verifying');
    setCodeError(null);
    try {
      await verifyPhoneCode({ code: codeValue.trim() });
      setVerified(true);
      setCodeStep('idle');
      setCodeValue('');
      hapticNotify('success');
    } catch (err) {
      const message =
        err instanceof ApiException ? err.message : 'Не удалось подтвердить код.';
      setCodeError(message);
      setCodeStep('awaiting-code');
      hapticNotify('error');
    }
  };

  // Состояние «сохранён»: компактная подтверждённая строка + «Изменить».
  if (status === 'saved' && saved) {
    return (
      <div>
        <div style={sectionLabelStyle}>{label}</div>
        <div style={fieldStyle}>
          <Icon id="i-phone" style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)' }} />
          <span>{formatPhoneDisplay(saved)}</span>
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--success)',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            <Icon id="i-check" style={{ width: '14px', height: '14px' }} />
            сохранён
          </span>
        </div>
        <button
          type="button"
          onClick={handleEdit}
          className="focus-ring"
          style={{
            marginTop: '8px',
            background: 'transparent',
            border: 'none',
            padding: '4px 2px',
            minHeight: '32px',
            color: 'var(--brand-dark)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Изменить номер
        </button>

        {verificationEnabled && (
          <div style={{ marginTop: '12px' }}>
            {verified ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--success)',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                <Icon id="i-shield" style={{ width: '15px', height: '15px' }} />
                Номер подтверждён
              </div>
            ) : codeStep === 'idle' || codeStep === 'sending' ? (
              <Button
                variant="secondary"
                icon="i-shield"
                onClick={handleSendCode}
                disabled={codeStep === 'sending'}
              >
                {codeStep === 'sending' ? 'Отправляем код…' : 'Подтвердить номер'}
              </Button>
            ) : (
              <div>
                <div
                  style={{
                    fontSize: '12px',
                    lineHeight: 1.4,
                    color: 'var(--muted-foreground)',
                    marginBottom: '8px',
                  }}
                >
                  {channel === 'sms'
                    ? 'Мы отправили код в SMS — введите его ниже.'
                    : 'Вам позвонит робот — введите последние 4 цифры звонящего номера.'}
                </div>
                <input
                  id={codeInputId}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codeValue}
                  disabled={codeStep === 'verifying'}
                  onChange={(e) => {
                    setCodeValue(e.target.value);
                    if (codeError) setCodeError(null);
                  }}
                  placeholder="1234"
                  maxLength={4}
                  aria-describedby={codeError ? codeErrorId : undefined}
                  aria-invalid={codeError ? true : undefined}
                  className="focus-ring"
                  style={{
                    ...fieldStyle,
                    width: '100%',
                    fontFamily: 'var(--font-sans)',
                    opacity: codeStep === 'verifying' ? 0.6 : 1,
                    borderColor: codeError ? 'var(--destructive)' : 'var(--border)',
                  }}
                />
                {codeError && (
                  <div
                    id={codeErrorId}
                    role="alert"
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      lineHeight: 1.4,
                      color: 'var(--destructive)',
                      fontWeight: 600,
                    }}
                  >
                    {codeError}
                  </div>
                )}
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <Button
                    variant="secondary"
                    icon="i-check"
                    onClick={handleVerifyCode}
                    disabled={codeStep === 'verifying' || codeValue.trim() === ''}
                  >
                    {codeStep === 'verifying' ? 'Проверяем…' : 'Подтвердить'}
                  </Button>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={codeStep === 'verifying'}
                    className="focus-ring"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '4px 2px',
                      minHeight: '32px',
                      color: 'var(--brand-dark)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: codeStep === 'verifying' ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    Отправить код ещё раз
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} style={{ ...sectionLabelStyle, display: 'block' }}>
        {label}
      </label>

      <input
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        disabled={status === 'loading' || status === 'saving'}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        placeholder="+7 905 123-44-12"
        aria-describedby={error ? errorId : hintId}
        aria-invalid={error ? true : undefined}
        className="focus-ring"
        style={{
          ...fieldStyle,
          width: '100%',
          fontFamily: 'var(--font-sans)',
          opacity: status === 'loading' || status === 'saving' ? 0.6 : 1,
          borderColor: error ? 'var(--destructive)' : 'var(--border)',
        }}
      />

      {error ? (
        <div
          id={errorId}
          role="alert"
          style={{
            marginTop: '6px',
            fontSize: '12px',
            lineHeight: 1.4,
            color: 'var(--destructive)',
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : (
        <div
          id={hintId}
          style={{
            marginTop: '6px',
            fontSize: '12px',
            lineHeight: 1.4,
            color: 'var(--muted-foreground)',
          }}
        >
          {status === 'load-error'
            ? 'Не удалось загрузить сохранённый номер — введите его заново.'
            : hint}
        </div>
      )}

      <div style={{ marginTop: '10px' }}>
        <Button
          variant="secondary"
          icon="i-phone"
          onClick={handleSave}
          disabled={!localValid || status === 'saving' || status === 'loading'}
        >
          {status === 'saving' ? 'Сохраняем…' : 'Сохранить номер'}
        </Button>
      </div>
    </div>
  );
};

export default PhoneField;
