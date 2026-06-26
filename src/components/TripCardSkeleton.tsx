/**
 * Скелетон карточки поездки для состояния загрузки.
 */

interface TripCardSkeletonProps {
  count?: number;
}

const TripCardSkeleton: React.FC<TripCardSkeletonProps> = ({ count = 2 }) => {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            gap: '12px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'var(--muted)',
            }}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                height: '16px',
                width: '60%',
                background: 'var(--muted)',
                borderRadius: '4px',
              }}
            />
            <div
              style={{
                height: '14px',
                width: '80%',
                background: 'var(--muted)',
                borderRadius: '4px',
              }}
            />
            <div
              style={{
                height: '14px',
                width: '40%',
                background: 'var(--muted)',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
      ))}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </>
  );
};

export default TripCardSkeleton;
