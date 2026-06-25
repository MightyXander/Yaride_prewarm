import { Icon } from './Icons';

interface ThemeToggleProps {
  onToggle: () => void;
  show: boolean;
}

// Кнопка смены темы — слева сверху, на месте кнопки «назад» (на главных экранах,
// где «назад» нет). Позиция привязана к центрированной 390px-колонке.
const ThemeToggle: React.FC<ThemeToggleProps> = ({ onToggle, show }) => {
  if (!show) return null;

  return (
    <button
      onClick={onToggle}
      aria-label="Сменить тему"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 12px)',
        left: 'max(calc(env(safe-area-inset-left) + 16px), calc(50% - 179px))',
        width: '32px',
        height: '32px',
        borderRadius: '11px',
        background: 'var(--secondary)',
        border: 'none',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        color: 'var(--foreground)',
        zIndex: 100,
        transition: 'transform 0.08s ease, filter 0.12s ease',
        outline: 'none',
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.92)';
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
      <Icon id="i-theme" style={{ width: '17px', height: '17px' }} />
    </button>
  );
};

export default ThemeToggle;
