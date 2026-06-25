import Button from '../components/ui/Button';

interface IntroScreenProps {
  onContinue: () => void;
}

const IntroScreen: React.FC<IntroScreenProps> = ({ onContinue }) => {
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
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            color: 'var(--brand-foreground)',
            fontSize: '18px',
          }}
        >
          Y
        </div>
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
      <RouteOption
        selected
        title="Брагино → Центр"
        subtitle="7:30–8:40 · будни"
      />
      <RouteOption
        selected={false}
        title="Центр → Брагино"
        subtitle="17:30–19:00 · будни"
      />
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
}

const RouteOption: React.FC<RouteOptionProps> = ({ selected, title, subtitle }) => {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
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
        transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
        }
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
