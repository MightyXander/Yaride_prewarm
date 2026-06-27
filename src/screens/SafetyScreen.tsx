import { useState } from 'react';
import Card from '../components/ui/Card';
import Toggle from '../components/ui/Toggle';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

interface SafetyRowProps {
  icon: string;
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const SafetyRow: React.FC<SafetyRowProps> = ({ icon, title, hint, checked, onChange }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      minHeight: '52px',
      padding: '6px 0',
    }}
  >
    <div
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '11px',
        background: 'var(--secondary)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--foreground)',
        flexShrink: 0,
      }}
    >
      <Icon id={icon} style={{ width: '17px', height: '17px' }} />
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>{title}</div>
      {hint && (
        <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
          {hint}
        </div>
      )}
    </div>
    <Toggle checked={checked} onChange={onChange} aria-label={title} />
  </div>
);

const SafetyScreen: React.FC = () => {
  const [sosEnabled, setSosEnabled] = useState(true);
  const [autoShare, setAutoShare] = useState(false);
  const [womenOnly, setWomenOnly] = useState(true);

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
      <Header title="Безопасность" />

      {/* Переключатели безопасности */}
      <Card style={{ padding: '4px 14px' }}>
        <SafetyRow
          icon="i-sos"
          title="Кнопка SOS в поездке"
          checked={sosEnabled}
          onChange={setSosEnabled}
        />
        <div style={{ height: '1px', background: 'var(--border)' }} />
        <SafetyRow
          icon="i-pin"
          title="Авто-делиться поездкой"
          hint="Близкий видит маршрут автоматически"
          checked={autoShare}
          onChange={setAutoShare}
        />
        <div style={{ height: '1px', background: 'var(--border)' }} />
        <SafetyRow
          icon="i-user"
          title="Только женский состав"
          hint="Показывать поездки с женщинами-водителями"
          checked={womenOnly}
          onChange={setWomenOnly}
        />
      </Card>

      {/* Доверенный контакт */}
      <div>
        <div style={sectionLabelStyle}>Доверенный контакт</div>
        <Card style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--muted-foreground)',
              flexShrink: 0,
            }}
          >
            <Icon id="i-user" style={{ width: '18px', height: '18px' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--muted-foreground)' }}>
              Не добавлен
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              window.Telegram?.WebApp?.showAlert?.('Функция появится в следующих версиях');
              window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
            }}
            style={{ minHeight: '40px', padding: '6px 14px', flexShrink: 0 }}
          >
            Добавить
          </Button>
        </Card>
      </div>

      {/* Подтверждение телефона */}
      <div>
        <div style={sectionLabelStyle}>Телефон</div>
        <Card style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--muted-foreground)',
              flexShrink: 0,
            }}
          >
            <Icon id="i-phone" style={{ width: '18px', height: '18px' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--muted-foreground)' }}>
              Не подтверждён
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              window.Telegram?.WebApp?.showAlert?.('Функция появится в следующих версиях');
              window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
            }}
            style={{ minHeight: '40px', padding: '6px 14px', flexShrink: 0 }}
          >
            Подтвердить
          </Button>
        </Card>
      </div>

      {/* Как работает SOS */}
      <Card variant="accent" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '12px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--brand-foreground)',
            flexShrink: 0,
          }}
        >
          <Icon id="i-shield" style={{ width: '18px', height: '18px' }} />
        </div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          Как работает <b style={{ fontWeight: 700 }}>SOS</b>: при нажатии звоним 112 и шлём
          геопозицию доверенному контакту. Доступен на всех экранах поездки.
        </div>
      </Card>
    </div>
  );
};

export default SafetyScreen;
