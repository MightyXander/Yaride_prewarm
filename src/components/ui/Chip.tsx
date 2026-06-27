interface ChipProps {
  children?: React.ReactNode;
  label?: string;
  variant?: 'default' | 'brand';
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const Chip: React.FC<ChipProps> = ({
  children,
  label,
  variant = 'default',
  selected = false,
  onClick,
  style,
}) => {
  const content = label ?? children;
  const isInteractive = !!onClick;

  const baseStyle: React.CSSProperties = {
    height: '44px',
    minWidth: '60px',
    padding: '0 16px',
    borderRadius: '14px',
    display: 'grid',
    placeItems: 'center',
    fontWeight: selected ? 700 : 600,
    fontSize: '15px',
    whiteSpace: 'nowrap',
    cursor: isInteractive ? 'pointer' : 'default',
    border: 'none',
    fontFamily: 'var(--font-sans)',
    transition: 'background 0.15s ease, color 0.15s ease, transform 0.08s ease',
  };

  const variantStyles = {
    default: {
      background: selected ? 'var(--gradient-brand)' : 'var(--secondary)',
      color: selected ? 'var(--brand-foreground)' : 'var(--secondary-foreground)',
    },
    brand: {
      background: 'var(--brand)',
      color: 'var(--brand-foreground)',
    },
  };

  const finalStyle = {
    ...baseStyle,
    ...variantStyles[variant],
    ...style,
  };

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="focus-ring pressable"
        style={finalStyle}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.94)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {content}
      </button>
    );
  }

  return <span style={finalStyle}>{content}</span>;
};

export default Chip;
