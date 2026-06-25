import { useState, useRef, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Icon } from '../components/Icons';
import type { Trip } from '../types/navigation';

interface BookingProfileScreenProps {
  trip: Trip;
  onConfirm: () => void;
}

// Заглушка имени из Telegram, фолбэк — пусто (покажем инпут)
const getTelegramName = (): string => {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (user?.first_name) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ');
  }
  return '';
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  minHeight: '48px',
  padding: '0 14px',
  borderRadius: '15px',
  background: 'var(--secondary)',
  border: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--foreground)',
};

const BookingProfileScreen: React.FC<BookingProfileScreenProps> = ({ trip, onConfirm }) => {
  const telegramName = getTelegramName();
  const [name, setName] = useState<string>(telegramName);
  // Телефон: 'idle' (не подтверждён) → 'otp' (ввод кода) → 'confirmed'
  const [phoneStep, setPhoneStep] = useState<'idle' | 'otp' | 'confirmed'>('idle');
  const [code, setCode] = useState<string[]>(['', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const phone = '+7 905 ··· 44 12';
  const codeComplete = code.every((d) => d.length === 1);
  const canConfirm = name.trim().length > 0 && phoneStep === 'confirmed';

  useEffect(() => {
    if (phoneStep === 'otp') {
      otpRefs.current[0]?.focus();
    }
  }, [phoneStep]);

  // Когда код введён полностью — «проверяем» и подтверждаем
  useEffect(() => {
    if (phoneStep === 'otp' && codeComplete) {
      const t = setTimeout(() => setPhoneStep('confirmed'), 350);
      return () => clearTimeout(t);
    }
  }, [phoneStep, codeComplete]);

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 3) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 2px',
          gap: '8px',
        }}
      >
        <div style={{ width: '32px', flexShrink: 0 }} />
        <div style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '-0.01em' }}>Почти готово</div>
        <div style={{ width: '32px', flexShrink: 0 }} />
      </div>

      {/* Что бронируем */}
      <Card style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '14px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            color: 'var(--brand-foreground)',
            fontSize: '18px',
            flexShrink: 0,
          }}
        >
          {trip.driver.avatar}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Бронируешь {trip.time}</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '2px',
              lineHeight: 1.4,
            }}
          >
            с {trip.driver.name} · {trip.car} · {trip.address}
          </div>
        </div>
      </Card>

      {/* Имя */}
      <div>
        <div style={sectionLabelStyle}>Имя</div>
        {telegramName ? (
          <div style={fieldStyle}>
            <span>{telegramName}</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--muted-foreground)',
              }}
            >
              из Telegram
            </span>
          </div>
        ) : (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как тебя звать?"
            aria-label="Имя"
            style={{
              ...fieldStyle,
              width: '100%',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid var(--brand)';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          />
        )}
      </div>

      {/* Телефон · подтверждение OTP-заглушкой */}
      <div>
        <div style={sectionLabelStyle}>Телефон · подтверждение</div>
        {phoneStep === 'confirmed' ? (
          <div style={fieldStyle}>
            <span>{phone}</span>
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
              подтверждён
            </span>
          </div>
        ) : phoneStep === 'otp' ? (
          <Card style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
              Отправили код из SMS на <b style={{ color: 'var(--foreground)' }}>{phone}</b>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`Цифра кода ${i + 1}`}
                  style={{
                    width: '100%',
                    height: '52px',
                    textAlign: 'center',
                    fontSize: '20px',
                    fontWeight: 800,
                    borderRadius: '14px',
                    border: `1px solid ${digit ? 'var(--brand)' : 'var(--border)'}`,
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.outline = '2px solid var(--brand)';
                    e.currentTarget.style.outlineOffset = '2px';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Это демо — введите любые 4 цифры
            </div>
          </Card>
        ) : (
          <Button variant="secondary" icon="i-phone" onClick={() => setPhoneStep('otp')}>
            Подтвердить телефон
          </Button>
        )}
      </div>

      {/* Инфо про SOS */}
      <Card variant="accent" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '12px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--brand-foreground)',
            flexShrink: 0,
            boxShadow: '0 8px 20px -10px rgba(255, 221, 45, .6)',
          }}
        >
          <Icon id="i-shield" style={{ width: '18px', height: '18px', strokeWidth: 2 }} />
        </div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          В поездке будут кнопка <b style={{ fontWeight: 700 }}>SOS</b> и «поделиться с близким».
        </div>
      </Card>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary" onClick={onConfirm} disabled={!canConfirm}>
          Подтвердить бронь
        </Button>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Оплаты в приложении нет — за бензин рассчитаетесь сами
        </div>
      </div>
    </div>
  );
};

export default BookingProfileScreen;
