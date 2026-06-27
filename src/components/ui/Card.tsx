interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'accent';
  style?: React.CSSProperties;
  role?: string;
  tabIndex?: number;
  'aria-expanded'?: boolean;
  'aria-label'?: string;
}

const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  style,
  role,
  tabIndex,
  'aria-expanded': ariaExpanded,
  'aria-label': ariaLabel,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    background: variant === 'accent' ? 'var(--accent)' : 'var(--elevated)',
    borderRadius: 'var(--radius-xl)',
    padding: '16px 16px',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-card)',
  };

  return (
    <div
      role={role}
      tabIndex={tabIndex}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      style={{ ...baseStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
