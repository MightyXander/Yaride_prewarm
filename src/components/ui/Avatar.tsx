import Badge from './Badge';

interface AvatarProps {
  label: string;
  rating?: number;
  size?: number;
  hideRating?: boolean;
}

const Avatar: React.FC<AvatarProps> = ({ label, rating, size = 46, hideRating = false }) => {
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
      {!hideRating && rating !== undefined && <Badge rating={rating} />}
    </div>
  );
};

export default Avatar;
