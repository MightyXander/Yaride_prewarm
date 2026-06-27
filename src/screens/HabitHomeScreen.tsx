import Topbar from '../components/Topbar';
import Hero from '../components/Hero';
import Button from '../components/ui/Button';
import { Icon } from '../components/Icons';
import type { Trip } from '../types/navigation';

interface HabitHomeScreenProps {
  regularDriver: Trip;
  onBookRegular: () => void;
  onViewOthers: () => void;
}

const HabitHomeScreen: React.FC<HabitHomeScreenProps> = ({
  regularDriver,
  onBookRegular,
  onViewOthers,
}) => {
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Topbar title="Добрый вечер, Дмитрий" subtitle="пора домой?" />
      <Hero
        subtitle="Твой вечерний маршрут"
        title={
          <>
            Центр →<br />Брагино
          </>
        }
        ctaText="обычно 18:00 · Пн–Пт"
      />

      {/* Карточка постоянного водителя — БЛЕДНО-ЖЁЛТЫЙ фон */}
      <div
        style={{
          background: 'color-mix(in oklab, var(--brand) 16%, var(--card))',
          borderRadius: 'var(--radius-xl)',
          padding: '13px 14px',
          border: '1px solid color-mix(in oklab, var(--brand) 42%, transparent)',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          gap: '11px',
          alignItems: 'flex-start',
          flexShrink: 0,
        }}
      >
        {/* Аватар */}
        <div
          style={{
            position: 'relative',
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            color: 'var(--brand-foreground)',
            fontSize: '16px',
            flexShrink: 0,
          }}
        >
          {regularDriver.driver.avatar}
          {/* Рейтинг-бейдж */}
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
              style={{ width: '9px', height: '9px', fill: '#f4b400', stroke: 'none' }}
            />
            {regularDriver.driver.rating.toFixed(1)}
          </span>
        </div>

        {/* Информация о водителе */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
            {regularDriver.driver.name}
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
            по пути · {regularDriver.car} · ≈{regularDriver.price} ₽
          </div>
        </div>

        {/* Время и места */}
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
            {regularDriver.time}
          </div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--brand-foreground)',
              background: 'var(--brand)',
              padding: '3px 10px',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
            }}
          >
            {regularDriver.seats} {regularDriver.seats === 1 ? 'место' : 'места'}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
          flexShrink: 0,
        }}
      >
        <Button variant="primary" onClick={onBookRegular}>
          Поехать домой как вчера
        </Button>
        <Button variant="secondary" onClick={onViewOthers}>
          Другие поездки на сегодня
        </Button>
      </div>
    </div>
  );
};

export default HabitHomeScreen;
