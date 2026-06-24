import { Icon } from './Icons';

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
        padding: '6px 2px',
        gap: '8px',
      }}
    >
      <div>
        <div
          style={{
            fontWeight: 800,
            fontSize: '15px',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--muted-foreground)',
              marginTop: '1px',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '11px',
          background: 'var(--secondary)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--foreground)',
          fontSize: '16px',
          flexShrink: 0,
        }}
      >
        <Icon id="i-sliders" />
      </div>
    </div>
  );
};

export default Topbar;
