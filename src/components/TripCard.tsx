import { forwardRef, useState } from 'react';
import { Icon } from './Icons';
import Card from './ui/Card';
import Avatar from './ui/Avatar';
import Chip from './ui/Chip';
import Button from './ui/Button';
import { showToast } from '../lib/toast';

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
  route?: {
    from: string;
    to: string;
    duration?: string;
  };
  expanded: boolean;
  onToggle: () => void;
  onBook: () => void;
  isOwn: boolean;
}

const TripCard = forwardRef<HTMLDivElement, TripCardProps>(
  ({ driver, address, car, price, time, seats, route, expanded, onToggle, onBook, isOwn }, ref) => {
    const [pressed, setPressed] = useState(false);

    const seatsLabel = seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест';
    const from = route?.from || `Брагино, ${address}`;
    const to = route?.to || 'Центр, пл. Волкова';
    const duration = route?.duration || '22 мин';

    const handleBook = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isOwn) {
        showToast('Нельзя забронировать свою поездку');
        return;
      }
      onBook();
    };

    return (
      <div ref={ref}>
        <Card
          className={`trip-card${pressed ? ' is-pressed' : ''}`}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={`Поездка от ${driver.name} в ${time}, ${seats} ${seatsLabel}, нажмите чтобы ${
            expanded ? 'свернуть' : 'раскрыть'
          }`}
          onClick={() => onToggle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          style={{
            cursor: 'pointer',
          }}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: '11px',
              alignItems: 'flex-start',
            }}
          >
            <Avatar label={driver.avatar} rating={driver.rating} />
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {driver.name}{' '}
                <span style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '13px' }}>
                  <Icon
                    id="i-car"
                    style={{ width: '11px', height: '11px', display: 'inline-block', marginRight: '2px' }}
                  />
                  {driver.tripCount} {driver.tripCount === 1 ? 'поездка' : driver.tripCount < 5 ? 'поездки' : 'поездок'}
                </span>
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{address}</div>
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span>{car}</span>
                <span>≈{price} ₽</span>
              </div>
            </div>
            <div
              style={{
                flexShrink: 0,
                width: '58px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '6px',
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: '18px',
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {time}
              </div>
              <Chip variant="brand">
                {seats} {seatsLabel}
              </Chip>
            </div>
          </div>

          <div className={`trip-card-reveal${expanded ? ' is-open' : ''}`} aria-hidden={!expanded}>
            <div className="trip-card-reveal-inner">
              <div
                style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Route timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      minHeight: '22px',
                    }}
                  >
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '999px',
                        border: '2px solid var(--brand)',
                        background: 'var(--brand)',
                        flexShrink: 0,
                      }}
                    />
                    {from}
                  </div>
                  <div
                    style={{
                      height: '14px',
                      borderLeft: '2px dotted var(--muted-foreground)',
                      marginLeft: '4px',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      minHeight: '22px',
                    }}
                  >
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '999px',
                        border: '2px solid var(--brand)',
                        flexShrink: 0,
                      }}
                    />
                    {to}
                  </div>
                </div>

                {/* Сбор и окно времени */}
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 14px',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '999px',
                        background: 'var(--brand)',
                        display: 'inline-block',
                      }}
                    />
                    Сбор: {address}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Icon id="i-clock" style={{ width: '12px', height: '12px' }} />
                    {time} · в пути ~{duration}
                  </span>
                </div>

                {/* Подсказка по бензину */}
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted-foreground)',
                    lineHeight: 1.5,
                  }}
                >
                  Бензин <b style={{ color: 'var(--foreground)', fontWeight: 700 }}>≈{price} ₽ пополам</b>{' '}
                  <span>— как подсказка для расчётов, без оплаты в приложении.</span>
                </div>

                {/* CTA */}
                <Button
                  variant="primary"
                  onClick={handleBook}
                  style={{
                    marginTop: '2px',
                    ...(isOwn && {
                      opacity: 0.5,
                      background: 'var(--muted)',
                      color: 'var(--muted-foreground)',
                      cursor: 'not-allowed',
                    }),
                  }}
                >
                  Забронировать
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }
);

TripCard.displayName = 'TripCard';

export default TripCard;
