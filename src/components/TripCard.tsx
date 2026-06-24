import { forwardRef, useState } from 'react';
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

const TripCard = forwardRef<HTMLDivElement, TripCardProps>(
  ({ driver, address, car, price, time, seats }, ref) => {
    const [expanded, setExpanded] = useState(false);
    return (
      <div ref={ref}>
        <Card
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={`Поездка от ${driver.name} в ${time}, ${seats} ${
            seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест'
          }, нажмите для деталей`}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(!expanded);
            }
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            gap: '11px',
            alignItems: 'flex-start',
            cursor: 'pointer',
            transition: 'transform 0.08s ease, filter 0.12s ease',
            outline: 'none',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.97)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onFocus={(e) => {
            e.currentTarget.style.filter = 'brightness(1.08)';
            e.currentTarget.style.outline = '2px solid var(--brand)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            e.currentTarget.style.filter = 'none';
            e.currentTarget.style.outline = 'none';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.05)';
          }}
        >
          <Avatar label={driver.avatar} rating={driver.rating} />
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
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
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '12px' }}>
                <Icon
                  id="i-car"
                  style={{ width: '10px', height: '10px', display: 'inline-block', marginRight: '2px' }}
                />
                {driver.tripCount} {driver.tripCount === 1 ? 'поездка' : driver.tripCount < 5 ? 'поездки' : 'поездок'}
              </span>
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                lineHeight: 1.4,
              }}
            >
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{address}</div>
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>{car}</span>
              <span>≈{price} ₽</span>
            </div>
            {expanded && (
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--muted-foreground)',
                  marginTop: '6px',
                  paddingTop: '9px',
                  borderTop: '1px solid var(--border)',
                  lineHeight: 1.5,
                }}
              >
                <div>📍 Точка сбора: {address}</div>
                <div style={{ marginTop: '4px' }}>🕐 Окно времени: {time} ± 5 мин</div>
              </div>
            )}
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
      </div>
    );
  }
);

TripCard.displayName = 'TripCard';

export default TripCard;
