import { Icon } from './Icons';
import { showToast } from '../lib/toast';

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
        // Левый отступ — под плавающую кнопку смены темы (слева сверху на главных),
        // чтобы она не перекрывала заголовок.
        padding: '6px 2px 6px 40px',
        gap: '8px',
      }}
    >
      <div style={{ minWidth: 0 }}>
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
      <button
        aria-label="Фильтры"
        onClick={() => showToast('Фильтры маршрута — скоро')}
        style={{
          minWidth: '44px',
          minHeight: '44px',
          borderRadius: '11px',
          background: 'var(--secondary)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--foreground)',
          fontSize: '16px',
          flexShrink: 0,
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          transition: 'transform 0.08s ease, filter 0.12s ease',
          outline: 'none',
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.97)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onFocus={(e) => {
          e.currentTarget.style.filter = 'brightness(1.08)';
          e.currentTarget.style.outline = '2px solid var(--brand)';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.filter = 'none';
          e.currentTarget.style.outline = 'none';
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(1.05)';
        }}
      >
        <Icon id="i-sliders" />
      </button>
    </div>
  );
};

export default Topbar;
