interface TopbarProps {
  title: string;
  subtitle?: string;
}

const Topbar: React.FC<TopbarProps> = ({ title, subtitle }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        gap: '8px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: '19px',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '15px',
              color: 'var(--muted-foreground)',
              marginTop: '2px',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

export default Topbar;
