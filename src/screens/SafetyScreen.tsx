import { useState } from 'react';
import Card from '../components/ui/Card';
import Toggle from '../components/ui/Toggle';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
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
  const [phoneVerified, setPhoneVerified] = useState(false);

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
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              background: 'var(--gradient-brand)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              color: 'var(--brand-foreground)',
              fontSize: '17px',
              flexShrink: 0,
            }}
          >
            М
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>Мама</div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              +7 920 ··· 88 30
            </div>
          </div>
          <button
            type="button"
            className="focus-ring pressable"
            aria-label="Изменить доверенный контакт"
            onClick={() => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light')}
            style={{
              minHeight: '44px',
              padding: '6px 12px',
              borderRadius: '12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--brand-dark)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              flexShrink: 0,
            }}
          >
            изменить
          </button>
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
              background: phoneVerified ? 'var(--gradient-brand)' : 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              color: phoneVerified ? 'var(--brand-foreground)' : 'var(--muted-foreground)',
              flexShrink: 0,
            }}
          >
            <Icon id="i-phone" style={{ width: '18px', height: '18px' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>+7 920 ··· 14 02</div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                marginTop: '2px',
                color: phoneVerified ? 'var(--success)' : 'var(--muted-foreground)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {phoneVerified ? (
                <>
                  <Icon id="i-check" style={{ width: '13px', height: '13px' }} />
                  Подтверждён
                </>
              ) : (
                'Не подтверждён'
              )}
            </div>
          </div>
          {!phoneVerified && (
            <Button
              variant="secondary"
              onClick={() => {
                setPhoneVerified(true);
                window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
              }}
              style={{ minHeight: '40px', padding: '6px 14px', flexShrink: 0 }}
            >
              Подтвердить
            </Button>
          )}
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
