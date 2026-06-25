import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { Icon } from '../components/Icons';

// Рыба-данные профиля (экран 13 SPEC: возраст, рейтинг, поездки, статус ВУ).
const PROFILE = {
  name: 'Никита Р.',
  avatar: 'Н',
  age: 28,
  rating: 4.9,
  tripCount: 23,
  licenseVerified: true,
  memberSince: 'апреля 2026',
};

const statValueStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 800,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--muted-foreground)',
  fontWeight: 600,
  marginTop: '3px',
};

const ProfileScreen: React.FC = () => {
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
        <div style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '-0.01em' }}>Профиль</div>
        <div style={{ width: '32px', flexShrink: 0 }} />
      </div>

      {/* Шапка: аватар, имя, возраст, статус ВУ */}
      <Card style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <Avatar label={PROFILE.avatar} rating={PROFILE.rating} size={54} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>
            {PROFILE.name}
            <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>
              {' '}
              · {PROFILE.age}&nbsp;года
            </span>
          </div>
          {PROFILE.licenseVerified ? (
            <div
              style={{
                color: 'var(--success)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                marginTop: '5px',
              }}
            >
              <Icon id="i-check" style={{ width: '14px', height: '14px' }} />
              ВУ подтверждено · с {PROFILE.memberSince}
            </div>
          ) : (
            <div
              style={{
                color: 'var(--muted-foreground)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                marginTop: '5px',
              }}
            >
              <Icon id="i-shield" style={{ width: '14px', height: '14px' }} />
              ВУ на проверке
            </div>
          )}
        </div>
      </Card>

      {/* Статистика: рейтинг и поездки */}
      <Card style={{ display: 'flex', alignItems: 'stretch', padding: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '14px', textAlign: 'center' }}>
          <div style={{ ...statValueStyle, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Icon id="i-star" fill style={{ width: '17px', height: '17px', fill: 'var(--star)' }} />
            {PROFILE.rating}
          </div>
          <div style={statLabelStyle}>рейтинг</div>
        </div>
        <div style={{ width: '1px', background: 'var(--border)' }} />
        <div style={{ flex: 1, padding: '14px', textAlign: 'center' }}>
          <div style={statValueStyle}>{PROFILE.tripCount}</div>
          <div style={statLabelStyle}>поездок</div>
        </div>
      </Card>

      {/* Статус ВУ — отдельная карточка */}
      <Card>
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '8px',
          }}
        >
          Документы
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              boxShadow: '0 8px 20px -10px rgba(255, 221, 45, .6)',
            }}
          >
            <Icon id="i-shield" style={{ width: '18px', height: '18px', strokeWidth: 2 }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Водительское удостоверение</div>
            <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600, marginTop: '2px' }}>
              {PROFILE.licenseVerified ? 'Подтверждено' : 'На проверке'}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
        <Button variant="ghost" icon="i-sliders">
          Настройки
        </Button>
      </div>
    </div>
  );
};

export default ProfileScreen;
