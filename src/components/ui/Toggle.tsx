import { hapticSelection } from '../../lib/haptics';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label': string;
  disabled?: boolean;
}

/**
 * Переключатель (switch) дизайн-системы. Тач-цель ≥44pt за счёт обёртки-кнопки.
 * Мягкий фокус через .focus-ring, press-состояние через .pressable.
 */
const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled = false, ...props }) => {
  const ariaLabel = props['aria-label'];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        hapticSelection();
        onChange(!checked);
      }}
      className="focus-ring pressable"
      style={{
        position: 'relative',
        width: '46px',
        minWidth: '46px',
        height: '28px',
        // расширяем тач-зону до ≥44pt без визуального изменения трека
        padding: '8px 0',
        margin: '-8px 0',
        boxSizing: 'content-box',
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'block',
          width: '46px',
          height: '28px',
          borderRadius: '999px',
          background: checked ? 'var(--gradient-brand)' : 'var(--secondary)',
          border: '1px solid var(--border)',
          boxShadow: checked ? '0 4px 12px -4px rgba(255, 210, 40, .5)' : 'none',
          transition: 'background 0.18s ease, box-shadow 0.18s ease',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: checked ? '21px' : '3px',
          width: '22px',
          height: '22px',
          marginTop: '-11px',
          borderRadius: '999px',
          background: '#fff',
          boxShadow: '0 2px 6px rgba(0, 0, 0, .25)',
          transition: 'left 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  );
};

export default Toggle;
