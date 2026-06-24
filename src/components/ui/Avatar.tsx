import Badge from './Badge';

interface AvatarProps {
  label: string;
  rating?: number;
  size?: number;
}

const Avatar: React.FC<AvatarProps> = ({ label, rating, size = 42 }) => {
  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '14px',
          background: 'var(--gradient-brand)',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          color: 'var(--brand-foreground)',
          fontSize: `${size * 0.38}px`,
        }}
      >
        {label}
      </div>
      {rating !== undefined && <Badge rating={rating} />}
    </div>
  );
};

export default Avatar;
