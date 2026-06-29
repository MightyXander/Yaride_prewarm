import { Icon } from '../Icons';
import { hapticImpact } from '../../lib/haptics';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
  // Тактильный отклик на нажатие. По умолчанию primary даёт лёгкий impact,
  // secondary/ghost — без отклика. 'none' отключает явно.
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  icon,
  haptic,
  children,
  disabled,
  ...props
}) => {
  const hapticStyle = haptic ?? (variant === 'primary' ? 'light' : 'none');
  const baseStyle: React.CSSProperties = {
    minHeight: '48px',
    padding: '10px 18px',
    borderRadius: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    fontWeight: 600,
    fontSize: '15px',
    lineHeight: 1.2,
    textAlign: 'center',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'transform 0.08s ease, opacity 0.08s ease, filter 0.12s ease',
    opacity: disabled ? 0.5 : 1,
    outline: 'none',
  };

  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: 'var(--gradient-brand)',
      color: 'var(--brand-foreground)',
      boxShadow: 'var(--shadow-hero)',
    },
    secondary: {
      background: 'var(--secondary)',
      color: 'var(--secondary-foreground)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--foreground)',
      border: '1px solid var(--border)',
    },
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      e.currentTarget.style.transform = 'scale(0.97)';
    }
    props.onMouseDown?.(e);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(1)';
    props.onMouseUp?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(1)';
    props.onMouseLeave?.(e);
  };

  return (
    <button
      {...props}
      disabled={disabled}
      className="focus-ring pressable"
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        ...props.style,
      }}
      onPointerDown={(e) => {
        if (!disabled && hapticStyle !== 'none') {
          hapticImpact(hapticStyle);
        }
        props.onPointerDown?.(e);
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.filter = 'brightness(1.05)';
        }
        props.onMouseEnter?.(e);
      }}
    >
      {icon && <Icon id={icon} />}
      {children}
    </button>
  );
};

export default Button;
