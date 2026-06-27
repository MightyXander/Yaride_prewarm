import { Icon } from './Icons';
import { showToast } from '../lib/toast';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onToggleDirection?: () => void;
  onPublish?: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ title, subtitle, onToggleDirection, onPublish }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        // Левый отступ — под плавающую кнопку смены темы (слева сверху на главных),
        // чтобы она не перекрывала заголовок. 52px = зазор ≥12px между кнопкой темы (~48px) и заголовком.
        padding: '6px 2px 6px 52px',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {onToggleDirection && (
          <button
            aria-label="Сменить направление"
            onClick={onToggleDirection}
            className="focus-ring pressable"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '11px',
              background: 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--foreground)',
              fontSize: '18px',
              flexShrink: 0,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'transform 0.08s ease, filter 0.12s ease',
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
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.05)';
            }}
          >
            ⇄
          </button>
        )}
        {onPublish && (
          <button
            aria-label="Возьму попутчиков"
            onClick={onPublish}
            className="focus-ring pressable"
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
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.05)';
            }}
          >
            <Icon id="i-car" />
          </button>
        )}
        <button
        aria-label="Уведомления"
        onClick={() => showToast('Уведомления — скоро')}
        className="focus-ring pressable"
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
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(1.05)';
        }}
      >
        <Icon id="i-bell" />
      </button>
      </div>
    </div>
  );
};

export default Topbar;
