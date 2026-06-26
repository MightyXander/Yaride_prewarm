/**
 * Empty state для пустого списка поездок (inline вариант).
 */

interface EmptyTripsStateProps {
  timeWindow?: string;
}

const EmptyTripsState: React.FC<EmptyTripsStateProps> = ({ timeWindow = 'это время' }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        gap: '12px',
        textAlign: 'center',
        color: 'var(--muted-foreground)',
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
        style={{ opacity: 0.5 }}
      >
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
      </svg>
      <div>
        <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--foreground)' }}>
          На {timeWindow} поездок нет
        </div>
        <div style={{ fontSize: '14px', marginTop: '4px' }}>
          Попробуй другое время или опубликуй свою
        </div>
      </div>
    </div>
  );
};

export default EmptyTripsState;
