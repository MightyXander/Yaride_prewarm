import { Icon } from '../Icons';

interface BadgeProps {
  rating: number;
}

const Badge: React.FC<BadgeProps> = ({ rating }) => {
  return (
    <span
      style={{
        position: 'absolute',
        right: '-6px',
        bottom: '-6px',
        background: 'var(--card)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderRadius: '999px',
        height: '17px',
        padding: '0 5px',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        fontSize: '9.5px',
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: '0 2px 6px rgba(0, 0, 0, .22)',
      }}
    >
      <Icon
        id="i-star"
        fill
        style={{ width: '9px', height: '9px', fill: 'var(--star)' }}
      />
      {rating}
    </span>
  );
};

export default Badge;
