/**
 * Error state для ошибки загрузки поездок с кнопкой retry.
 */

import Button from './ui/Button';

interface ErrorTripsStateProps {
  onRetry: () => void;
  error?: Error;
}

const ErrorTripsState: React.FC<ErrorTripsStateProps> = ({ onRetry, error }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        gap: '16px',
        textAlign: 'center',
      }}
    >
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.5, color: 'var(--destructive)' }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div>
        <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--foreground)' }}>
          Не удалось загрузить поездки
        </div>
        <div style={{ fontSize: '14px', marginTop: '4px', color: 'var(--muted-foreground)' }}>
          {error?.message ?? 'Проверь соединение и попробуй снова'}
        </div>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
};

export default ErrorTripsState;
