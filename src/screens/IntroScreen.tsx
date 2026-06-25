import { useState } from 'react';
import Button from '../components/ui/Button';

interface IntroScreenProps {
  onContinue: () => void;
}

interface RouteData {
  id: string;
  title: string;
  subtitle: string;
}

const ROUTES: RouteData[] = [
  { id: 'bragino-center', title: 'Брагино → Центр', subtitle: '7:30–8:40 · будни' },
  { id: 'center-bragino', title: 'Центр → Брагино', subtitle: '17:30–19:00 · будни' },
];

const IntroScreen: React.FC<IntroScreenProps> = ({ onContinue }) => {
  const [selectedRoute, setSelectedRoute] = useState<string>(ROUTES[0].id);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedRoute(ROUTES[index].id);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedRoute(ROUTES[(index + 1) % ROUTES.length].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedRoute(ROUTES[(index - 1 + ROUTES.length) % ROUTES.length].id);
    }
  };

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
      <div style={{ marginTop: '8px' }}>
        <img
          src="/brand/icon-192.png"
          alt="поехали вместе"
          width={44}
          height={44}
          style={{ width: '44px', height: '44px', borderRadius: '12px', display: 'block' }}
        />
      </div>
      <div
        style={{
          fontSize: '26px',
          lineHeight: 1.12,
          marginTop: '4px',
          fontWeight: 800,
          letterSpacing: '-0.01em',
        }}
      >
        Попутчики по дороге
        <br />
        на работу. Без давки.
      </div>
      <div
        style={{
          fontSize: '13px',
          marginTop: '-2px',
          color: 'var(--muted-foreground)',
        }}
      >
        Утром по одному маршруту — дешевле и живее автобуса.
      </div>
      <div
        id="route-group-label"
        style={{
          marginTop: '10px',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--muted-foreground)',
          fontWeight: 700,
        }}
      >
        Куда едешь утром?
      </div>
      <div
        role="radiogroup"
        aria-labelledby="route-group-label"
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        {ROUTES.map((route, index) => (
          <RouteOption
            key={route.id}
            selected={selectedRoute === route.id}
            title={route.title}
            subtitle={route.subtitle}
            onSelect={() => setSelectedRoute(route.id)}
            onKeyDown={(e) => handleKeyDown(index, e)}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary" icon="i-arrow-r" onClick={onContinue}>
          Показать поездки
        </Button>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Регистрация не нужна, чтобы посмотреть
        </div>
      </div>
    </div>
  );
};

interface RouteOptionProps {
  selected: boolean;
  title: string;
  subtitle: string;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

const RouteOption: React.FC<RouteOptionProps> = ({
  selected,
  title,
  subtitle,
  onSelect,
  onKeyDown,
}) => {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      className="focus-ring pressable"
      onClick={onSelect}
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minHeight: '54px',
        padding: '0 15px',
        borderRadius: '17px',
        background: 'var(--surface)',
        border: `1px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
        boxShadow: selected ? 'inset 0 0 0 1px var(--brand)' : 'none',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '999px',
          border: `2px solid ${selected ? 'var(--brand)' : 'var(--muted-foreground)'}`,
          background: selected ? 'var(--brand)' : 'transparent',
          flexShrink: 0,
        }}
      />
      <div>
        <div>{title}</div>
        <div
          style={{
            color: 'var(--muted-foreground)',
            fontWeight: 500,
            fontSize: '11px',
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
};

export default IntroScreen;
