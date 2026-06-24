const StatusBar: React.FC = () => {
  const time = new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      style={{
        height: '38px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 22px 0',
        fontSize: '13px',
        fontWeight: 700,
      }}
    >
      <span style={{ letterSpacing: '-0.01em' }}>{time}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <svg
          className="sb"
          viewBox="0 0 18 12"
          style={{ height: '11px', width: 'auto', fill: 'currentColor' }}
        >
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5" width="3" height="7" rx="1" />
          <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg
          className="sb"
          viewBox="0 0 26 12"
          style={{
            height: '11px',
            width: 'auto',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1,
          }}
        >
          <rect x="0.6" y="0.6" width="22" height="10.8" rx="3" />
          <rect x="2" y="2" width="17" height="8" rx="1.6" fill="currentColor" />
          <rect x="23.6" y="4" width="1.8" height="4" rx="1" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
};

export default StatusBar;
