import { createPortal } from 'react-dom';
import { Icon } from './Icons';

interface ThemeToggleProps {
  onToggle: () => void;
  show: boolean;
}

// Кнопка смены темы — слева сверху, на месте кнопки «назад» (на главных экранах,
// где «назад» нет). Позиция привязана к центрированной 430px-колонке (#40).
// 199px = 430/2 − 16 (внутр. отступ). На вьюпортах ≤430 кнопка встаёт на 16px
// (край full-width приложения), на ≥430 (десктоп) — у левого края 430-колонки.
// Рендерится через portal в document.body для гарантированной фиксации к viewport
// (исключает проблемы с containing-block от transform/motion предков).
const ThemeToggle: React.FC<ThemeToggleProps> = ({ onToggle, show }) => {
  if (!show) return null;

  return createPortal(
    <button
      onClick={onToggle}
      aria-label="Сменить тему"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 12px)',
        left: 'max(calc(env(safe-area-inset-left) + 16px), calc(50% - 199px))',
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
      }}
      onBlur={(e) => {
        e.currentTarget.style.filter = 'none';
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.05)';
      }}
    >
      <Icon id="i-theme" style={{ width: '17px', height: '17px' }} />
    </button>,
    document.body
  );
};

export default ThemeToggle;
