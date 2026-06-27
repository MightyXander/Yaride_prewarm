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
        height: '19px',
        padding: '0 6px',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '11px',
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: '0 2px 6px rgba(0, 0, 0, .22)',
      }}
    >
      <Icon
        id="i-star"
        fill
        style={{ width: '10px', height: '10px', fill: 'var(--star)' }}
      />
      {rating}
    </span>
  );
};

export default Badge;
