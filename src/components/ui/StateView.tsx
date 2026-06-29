import type { ReactNode } from 'react';

// Состояния загрузки данных по эталону: «Не удалось загрузить» (error) + «пусто» (empty).
// Центрированный блок: иконка-кружок 76px + заголовок + подзаголовок (+ кнопка «Повторить» у error).

const wrapStyle = (compact: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  padding: compact ? '36px 20px 20px' : '40px 20px 24px',
  gap: '16px',
});

const circleStyle: React.CSSProperties = {
  width: '76px',
  height: '76px',
  borderRadius: '50%',
  background: 'var(--secondary)',
  display: 'grid',
  placeItems: 'center',
  color: 'var(--muted-foreground)',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: '18px',
  letterSpacing: '-0.01em',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '14.5px',
  color: 'var(--muted-foreground)',
  marginTop: '6px',
  lineHeight: 1.5,
  maxWidth: '250px',
};

// Иконка «нет соединения» (cloud-off) — для состояния ошибки.
const CloudOffIcon = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ width: '32px', height: '32px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}
    aria-hidden="true"
  >
    <path d="M3 15a4 4 0 0 0 4 4h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.5 8.5" />
    <path d="M3 3l18 18" />
  </svg>
);

interface LoadErrorStateProps {
  /** Заголовок (по умолчанию «Не удалось загрузить»). */
  title?: string;
  /** Подзаголовок (по умолчанию про соединение). */
  subtitle?: string;
  /** Повторить загрузку. */
  onRetry: () => void;
}

/** Состояние ошибки загрузки данных (эталон): cloud-off + «Не удалось загрузить» + «Повторить». */
export const LoadErrorState: React.FC<LoadErrorStateProps> = ({
  title = 'Не удалось загрузить',
  subtitle = 'Проверь соединение и попробуй ещё раз.',
  onRetry,
}) => (
  <div style={wrapStyle(false)} role="alert">
    <div style={circleStyle}>
      <CloudOffIcon />
    </div>
    <div>
      <div style={titleStyle}>{title}</div>
      <div style={subtitleStyle}>{subtitle}</div>
    </div>
    <button
      type="button"
      onClick={onRetry}
      className="focus-ring pressable"
      style={{
        minHeight: '48px',
        padding: '0 22px',
        borderRadius: '18px',
        border: 'none',
        background: 'var(--gradient-brand)',
        color: 'var(--brand-foreground)',
        fontWeight: 700,
        fontSize: '15px',
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-hero)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        style={{ width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v4h4" />
      </svg>
      Повторить
    </button>
  </div>
);

interface EmptyStateProps {
  /** Иконка внутри кружка (svg/Icon). */
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Необязательное действие под текстом. */
  action?: ReactNode;
}

/** Пустое состояние (эталон): кружок с иконкой + заголовок + подзаголовок. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, subtitle, action }) => (
  <div style={wrapStyle(true)}>
    <div style={circleStyle}>{icon}</div>
    <div>
      <div style={titleStyle}>{title}</div>
      {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
    </div>
    {action}
  </div>
);
