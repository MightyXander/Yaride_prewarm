import { useId, useState } from 'react';

/**
 * AuthKit — общие строительные блоки экранов авторизации (gate / login / register).
 * Только inline-стили + токены тем (свет/тьма переключаются сами). Без новых зависимостей.
 *
 * Сигнатурный элемент бренда — знак-иконка Yaride (метка с авто), бренд-ассет из
 * public/brand/. Он же логотип Yaride.
 */

/* ----------------------------- Логотип / знак ----------------------------- */

interface BrandLogoProps {
  /** Размер бренд-знака (квадратного бейджа). По умолчанию 40 (login/register). */
  size?: number;
  /** Размер слова «Yaride». По умолчанию 19. */
  wordSize?: number;
  /** Центрировать строку (для gate). */
  center?: boolean;
}

/** Бренд-знак Yaride (app-icon из бренд-бука) + словесный знак «Yaride». */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 40, wordSize = 19, center = false }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: size >= 46 ? '11px' : '10px',
      justifyContent: center ? 'center' : 'flex-start',
    }}
  >
    {/*
      Знак-иконка уже содержит собственный жёлтый фон и скругление — рисуем её
      напрямую, без квадрата-обёртки. Берём ассет 512px с запасом для ретины,
      одинаков в обеих темах (это нормально для растрового бренд-знака).
    */}
    <img
      src="/brand/icon-512.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.3)}px`,
        flexShrink: 0,
        boxShadow: 'var(--shadow-hero)',
        display: 'block',
        objectFit: 'cover',
      }}
    />
    <span style={{ fontWeight: 800, fontSize: `${wordSize}px`, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
      Yaride
    </span>
  </div>
);

/* ------------------------------ Стили полей ------------------------------ */

export const authLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  paddingLeft: '4px',
};

export const authHintStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--muted-foreground)',
  paddingLeft: '4px',
};

function inputStyle(error: boolean, hasPrefix: boolean, hasSuffix: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: '54px',
    borderRadius: '18px',
    border: `1.5px solid ${error ? 'var(--danger)' : 'var(--field-border)'}`,
    background: 'var(--field)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-sans)',
    fontSize: '15px',
    fontWeight: 500,
    paddingLeft: hasPrefix ? '34px' : '16px',
    paddingRight: hasSuffix ? '52px' : '16px',
    outline: 'none',
    // Постоянное красное кольцо в состоянии ошибки (перекрывает focus-лифт класса .focus-ring).
    boxShadow: error ? '0 0 0 4px color-mix(in srgb, var(--danger) 16%, transparent)' : undefined,
  };
}

/* ------------------------------ Сообщение об ошибке ------------------------------ */

export const AuthError: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    role="alert"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      color: 'var(--danger)',
      fontSize: '13px',
      fontWeight: 600,
      paddingLeft: '2px',
    }}
  >
    <span
      aria-hidden
      style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'var(--danger)',
        color: 'var(--danger-foreground)',
        display: 'grid',
        placeItems: 'center',
        fontSize: '11px',
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      !
    </span>
    {children}
  </div>
);

/* ------------------------------ Текстовое поле ------------------------------ */

interface AuthFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email';
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
  hint?: string;
  /** Префикс в поле (например, «@» для ника). */
  prefix?: string;
  maxLength?: number;
  autoFocus?: boolean;
  name?: string;
}

export const AuthField: React.FC<AuthFieldProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  error,
  hint,
  prefix,
  maxLength,
  autoFocus,
  name,
}) => {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <label htmlFor={id} style={authLabelStyle}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted-foreground)',
              fontSize: '15px',
              fontWeight: 600,
            }}
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          name={name}
          className="focus-ring"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          style={inputStyle(Boolean(error), Boolean(prefix), false)}
        />
      </div>
      {error ? (
        <div id={`${id}-err`}>
          <AuthError>{error}</AuthError>
        </div>
      ) : (
        hint && (
          <span id={`${id}-hint`} style={authHintStyle}>
            {hint}
          </span>
        )
      )}
    </div>
  );
};

/* ------------------------------ Поле пароля ------------------------------ */

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}

/** Глаз показать/скрыть: при показанном пароле перечёркнут (как в макете). */
const EyeIcon: React.FC<{ off: boolean }> = ({ off }) => (
  <span style={{ position: 'relative', width: '22px', height: '22px', display: 'grid', placeItems: 'center' }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
    {off && (
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '10px',
          height: '2px',
          background: 'currentColor',
          transform: 'rotate(45deg)',
          borderRadius: '2px',
        }}
      />
    )}
  </span>
);

export const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  error,
  hint,
}) => {
  const id = useId();
  const [show, setShow] = useState(false);
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <label htmlFor={id} style={authLabelStyle}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          className="focus-ring"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          style={inputStyle(Boolean(error), false, true)}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
          aria-pressed={show}
          className="focus-ring"
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '40px',
            height: '40px',
            border: 'none',
            background: 'transparent',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            color: 'var(--muted-foreground)',
            borderRadius: '12px',
          }}
        >
          <EyeIcon off={show} />
        </button>
      </div>
      {error ? (
        <div id={`${id}-err`}>
          <AuthError>{error}</AuthError>
        </div>
      ) : (
        hint && (
          <span id={`${id}-hint`} style={authHintStyle}>
            {hint}
          </span>
        )
      )}
    </div>
  );
};

/* ------------------------------ Спиннер кнопки ------------------------------ */

/** Маленький крутящийся индикатор для состояния загрузки кнопки. */
export const ButtonSpinner: React.FC = () => (
  <span
    aria-hidden
    style={{
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      border: '2.5px solid color-mix(in srgb, var(--brand-foreground) 28%, transparent)',
      borderTopColor: 'var(--brand-foreground)',
      animation: 'ya-auth-spin 0.7s linear infinite',
    }}
  />
);

