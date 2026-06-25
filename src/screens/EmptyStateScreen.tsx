import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Icon } from '../components/Icons';

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 2px',
          gap: '8px',
        }}
      >
        <div style={{ width: '32px', flexShrink: 0 }} />
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: '14px',
              letterSpacing: '-0.01em',
            }}
          >
            Брагино → Центр
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--muted-foreground)',
              marginTop: '1px',
            }}
          >
            сегодня · 7:30–8:40
          </div>
        </div>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '11px',
            background: 'var(--secondary)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--foreground)',
            fontSize: '16px',
            flexShrink: 0,
          }}
        >
          <Icon id="i-sliders" style={{ width: '16px', height: '16px' }} />
        </div>
      </div>

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

      <Card
        style={{
          display: 'flex',
          gap: '11px',
          alignItems: 'center',
          cursor: 'pointer',
          transition: 'filter 0.12s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'none';
        }}
      >
        <Icon id="i-bookmark" style={{ width: '19px', color: 'var(--brand)' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>Оставить заявку</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '0',
              lineHeight: 1.4,
            }}
          >
            «Нужно к 8:30 в центр» — увидят водители
          </div>
        </div>
      </Card>

      <Card
        style={{
          display: 'flex',
          gap: '11px',
          alignItems: 'center',
          cursor: 'pointer',
          transition: 'filter 0.12s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'none';
        }}
      >
        <Icon id="i-bell" style={{ width: '19px', color: 'var(--brand)' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>Сообщить, когда появится</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '0',
              lineHeight: 1.4,
            }}
          >
            Пуш, как только выложат поездку
          </div>
        </div>
      </Card>

      <Card
        style={{
          display: 'flex',
          gap: '11px',
          alignItems: 'center',
          cursor: 'pointer',
          transition: 'filter 0.12s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'none';
        }}
      >
        <Icon id="i-mega" style={{ width: '19px', color: 'var(--brand)' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>Позвать в чат района</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '0',
              lineHeight: 1.4,
            }}
          >
            Поделиться маршрутом в Telegram
          </div>
        </div>
      </Card>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary">Оставить заявку</Button>
      </div>
    </div>
  );
};

export default EmptyStateScreen;
