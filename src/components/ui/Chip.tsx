interface ChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'brand';
  style?: React.CSSProperties;
}

const Chip: React.FC<ChipProps> = ({ children, variant = 'default', style }) => {
  const baseStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
    display: 'inline-block',
  };

  const variantStyles = {
    default: {
      background: 'var(--secondary)',
      color: 'var(--secondary-foreground)',
    },
    brand: {
      background: 'var(--brand)',
      color: 'var(--brand-foreground)',
    },
  };

  return (
    <span
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export default Chip;
