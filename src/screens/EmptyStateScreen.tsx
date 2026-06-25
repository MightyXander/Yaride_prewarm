import Card from '../components/ui/Card';
import Header from '../components/Header';
import { Icon } from '../components/Icons';

interface ActionCardProps {
  icon: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
}

const ActionCard: React.FC<ActionCardProps> = ({ icon, title, subtitle, onClick }) => (
  <Card
    role="button"
    tabIndex={0}
    aria-label={title}
    className="focus-ring pressable"
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    }}
    style={{
      display: 'flex',
      gap: '11px',
      alignItems: 'center',
      cursor: 'pointer',
    }}
  >
    <Icon id={icon} style={{ width: '19px', color: 'var(--brand)' }} />
    <div>
      <div style={{ fontWeight: 700, fontSize: '14px' }}>{title}</div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--muted-foreground)',
          marginTop: '0',
          lineHeight: 1.4,
        }}
      >
        {subtitle}
      </div>
    </div>
  </Card>
);

const EmptyStateScreen: React.FC = () => {
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
      <Header title="Брагино → Центр" subtitle="сегодня · 7:30–8:40" />

      <Card style={{ padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '34px', color: 'var(--brand)' }}>
          <Icon id="i-search" style={{ width: '34px', height: '34px', strokeWidth: 1.6 }} />
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: '17px',
            letterSpacing: '-0.01em',
            marginTop: '6px',
          }}
        >
          Пока пусто
        </div>
        <div
          style={{
            fontSize: '13px',
            marginTop: '4px',
            color: 'var(--muted-foreground)',
          }}
        >
          Поездок на это время нет. Не уходи — сделай так, чтобы тебя нашли.
        </div>
      </Card>

      <ActionCard
        icon="i-bookmark"
        title="Оставить заявку"
        subtitle="«Нужно к 8:30 в центр» — увидят водители"
      />
      <ActionCard
        icon="i-bell"
        title="Сообщить, когда появится"
        subtitle="Пуш, как только выложат поездку"
      />
      <ActionCard
        icon="i-mega"
        title="Позвать в чат района"
        subtitle="Поделиться маршрутом в Telegram"
      />
    </div>
  );
};

export default EmptyStateScreen;
