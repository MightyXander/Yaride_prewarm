import { Icon } from './Icons';
import Card from './ui/Card';
import Avatar from './ui/Avatar';
import Chip from './ui/Chip';

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
    <Card
      style={{
        display: 'flex',
        gap: '11px',
        alignItems: 'flex-start',
      }}
    >
      <Avatar label={driver.avatar} rating={driver.rating} />
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
              color: 'var(--star)',
              fontWeight: 700,
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <Icon id="i-star" fill style={{ width: '9px', height: '9px', fill: 'var(--star)' }} />
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
        <Chip variant="brand">
          {seats} {seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест'}
        </Chip>
      </div>
    </Card>
  );
};

export default TripCard;
