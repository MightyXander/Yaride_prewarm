import { forwardRef, useState } from 'react';
import { Icon } from './Icons';
import Card from './ui/Card';
import Avatar from './ui/Avatar';
import Button from './ui/Button';
import { showToast } from '../lib/toast';

interface TripCardProps {
  driver: {
    name: string;
    rating: number;
    tripCount: number;
    avatar: string;
    id?: number;
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
  carColor: string | null;
  plate: string | null;
  onOpenProfile?: (userId: number) => void;
}

const TripCard = forwardRef<HTMLDivElement, TripCardProps>(
  ({ driver, address, car, price, time, seats, route, expanded, onToggle, onBook, isOwn, carColor, plate, onOpenProfile }, ref) => {
    const [pressed, setPressed] = useState(false);

    const seatsLabel = seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест';
    const from = route?.from || `Брагино, ${address}`;
    const to = route?.to || 'Центр, пл. Волкова';
    const duration = route?.duration || '22 мин';

    // Извлечь только улицу из адреса (убрать район)
    const street = address.split(',')[0]?.trim() || address;

    const handleBook = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isOwn) {
        showToast('Нельзя забронировать свою поездку');
        return;
      }
      onBook();
    };

    const handleAvatarClick = (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      if (driver.id && onOpenProfile) {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
        onOpenProfile(driver.id);
      }
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
            {/* Колонка 1: аватар + счётчик поездок под ним */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
              <div
                role={driver.id && onOpenProfile ? 'button' : undefined}
                tabIndex={driver.id && onOpenProfile ? 0 : undefined}
                aria-label={driver.id && onOpenProfile ? `Открыть профиль ${driver.name}` : undefined}
                onClick={driver.id && onOpenProfile ? handleAvatarClick : undefined}
                onKeyDown={driver.id && onOpenProfile ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleAvatarClick(e);
                  }
                } : undefined}
                style={{
                  cursor: driver.id && onOpenProfile ? 'pointer' : 'default',
                }}
                className={driver.id && onOpenProfile ? 'focus-ring pressable' : undefined}
              >
                <Avatar label={driver.avatar} rating={driver.rating} />
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--muted-foreground)',
                  fontWeight: 700,
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                }}
                title="совершено поездок"
              >
                <Icon
                  id="i-car"
                  style={{ width: '12px', height: '12px', display: 'inline-block' }}
                />
                {driver.tripCount}
              </span>
            </div>

            {/* Колонка 2: имя, адрес-улица, модель·цвет + госномер */}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '17px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                  maxWidth: '100%',
                }}
              >
                {driver.name}
              </div>
              <div
                style={{
                  fontSize: '15px',
                  color: 'var(--muted-foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                  maxWidth: '100%',
                }}
              >
                {street}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    color: 'var(--muted-foreground)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                    flex: '1 1 auto',
                    minWidth: 0,
                  }}
                >
                  {car}
                  {carColor ? ` · ${carColor}` : ''}
                </span>
                {plate && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: '19px',
                      padding: '0 7px',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      background: 'color-mix(in srgb, var(--foreground) 6%, var(--card))',
                      fontWeight: 800,
                      fontSize: '11px',
                      letterSpacing: '0.03em',
                      color: 'var(--foreground)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {plate}
                  </span>
                )}
              </div>
            </div>

            {/* Колонка 3: время + кнопка с ценой и местами */}
            <div
              style={{
                flexShrink: 0,
                minWidth: '58px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '6px',
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: '20px',
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {time}
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  minHeight: '36px',
                  padding: '5px 13px',
                  borderRadius: '13px',
                  background: 'var(--secondary)',
                  color: 'var(--foreground)',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '14px',
                    letterSpacing: '-0.01em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ≈{price} ₽
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '10.5px',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {seats} {seatsLabel}
                </span>
              </span>
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
                      gap: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      minHeight: '24px',
                    }}
                  >
                    <span
                      style={{
                        width: '11px',
                        height: '11px',
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
                      height: '16px',
                      borderLeft: '2px dotted var(--muted-foreground)',
                      marginLeft: '5px',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      minHeight: '24px',
                    }}
                  >
                    <span
                      style={{
                        width: '11px',
                        height: '11px',
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
                    fontSize: '15px',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '5px 16px',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '999px',
                        background: 'var(--brand)',
                        display: 'inline-block',
                      }}
                    />
                    Сбор: {address}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Icon id="i-clock" style={{ width: '13px', height: '13px' }} />
                    {time} · в пути ~{duration}
                  </span>
                </div>

                {/* Подсказка по бензину */}
                <div
                  style={{
                    fontSize: '15px',
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
