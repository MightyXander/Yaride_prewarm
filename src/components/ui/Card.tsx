interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent';
  style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({ children, variant = 'default', style }) => {
  const baseStyle: React.CSSProperties = {
    background: variant === 'accent' ? 'var(--accent)' : 'var(--elevated)',
    borderRadius: 'var(--radius-xl)',
    padding: '13px 14px',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-card)',
  };

  return <div style={{ ...baseStyle, ...style }}>{children}</div>;
};

export default Card;
