import { Icon } from './Icons';

interface TripCardProps {
  driver: {
    name: string;
    rating: number;
    tripCount: number;
    avatar: string;
  };
  address: string;
  car: string;
  price: string;
  time: string;
  seats: number;
}

const TripCard: React.FC<TripCardProps> = ({ driver, address, car, price, time, seats }) => {
  return (
    <div
      style={{
        background: 'var(--elevated)',
        borderRadius: 'var(--radius-xl)',
        padding: '13px 14px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        gap: '11px',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '14px',
          background: 'var(--gradient-brand)',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          color: '#18170f',
          fontSize: '16px',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {driver.avatar}
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
            className="fill"
            style={{ width: '9px', height: '9px', fill: '#f4b400' }}
          />
          {driver.rating}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {driver.name}{' '}
          <span
            style={{
              color: '#f4b400',
              fontWeight: 700,
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <Icon id="i-star" fill style={{ width: '9px', height: '9px', fill: '#f4b400' }} />
            {driver.rating}
          </span>{' '}
          <span style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '12px' }}>
            {driver.tripCount}
          </span>
        </div>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            marginTop: '3px',
            lineHeight: 1.55,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {address} · {car} · ≈{price} ₽
        </div>
      </div>
      <div
        style={{
          flexShrink: 0,
          width: '54px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px',
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: '16px',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {time}
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#18170f',
            background: 'var(--brand)',
            padding: '3px 10px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
          }}
        >
          {seats} {seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест'}
        </span>
      </div>
    </div>
  );
};

export default TripCard;
