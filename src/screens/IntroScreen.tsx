import { useState } from 'react';
import { Icon } from '../components/Icons';
import type { UserRole } from '../lib/role';

interface IntroScreenProps {
  onRoleSelect: (role: UserRole) => void;
}

const IntroScreen: React.FC<IntroScreenProps> = ({ onRoleSelect }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('passenger');

  const handleSelect = (role: UserRole) => {
    setSelectedRole(role);
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('medium');
  };

  const handleContinue = () => {
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light');
    onRoleSelect(selectedRole);
  };

  const handleKeyDown = (role: UserRole, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(role);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      handleSelect(role === 'passenger' ? 'driver' : 'passenger');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      handleSelect(role === 'passenger' ? 'driver' : 'passenger');
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
          fontSize: '28px',
          lineHeight: 1.12,
          marginTop: '4px',
          fontWeight: 800,
          letterSpacing: '-0.01em',
        }}
      >
        Выбери роль
      </div>
      <div
        style={{
          fontSize: '15px',
          marginTop: '-2px',
          color: 'var(--muted-foreground)',
        }}
      >
        По одному маршруту — вместе выгоднее.
      </div>
      <div
        id="role-group-label"
        style={{
          marginTop: '12px',
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--muted-foreground)',
          fontWeight: 700,
        }}
      >
        Кто ты сегодня?
      </div>
      <div
        role="radiogroup"
        aria-labelledby="role-group-label"
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        <RoleOption
          selected={selectedRole === 'passenger'}
          icon="i-user"
          title="Пассажир"
          subtitle="Ищу попутку на работу"
          onSelect={() => handleSelect('passenger')}
          onKeyDown={(e) => handleKeyDown('passenger', e)}
        />
        <RoleOption
          selected={selectedRole === 'driver'}
          icon="i-car"
          title="Водитель"
          subtitle="Возьму попутчиков"
          onSelect={() => handleSelect('driver')}
          onKeyDown={(e) => handleKeyDown('driver', e)}
        />
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
        <button
          onClick={handleContinue}
          className="focus-ring pressable"
          style={{
            minHeight: '52px',
            padding: '0 18px',
            borderRadius: '14px',
            background: 'var(--brand)',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'transform 0.08s ease, filter 0.12s ease',
          }}
        >
          Продолжить
          <Icon id="i-arrow-r" />
        </button>
      </div>
    </div>
  );
};

interface RoleOptionProps {
  selected: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

const RoleOption: React.FC<RoleOptionProps> = ({
  selected,
  icon,
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
        gap: '14px',
        minHeight: '72px',
        padding: '0 16px',
        borderRadius: '18px',
        background: 'var(--surface)',
        border: `1px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
        boxShadow: selected ? 'inset 0 0 0 1px var(--brand)' : 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: selected ? 'var(--brand)' : 'var(--secondary)',
          color: selected ? '#fff' : 'var(--foreground)',
          display: 'grid',
          placeItems: 'center',
          fontSize: '20px',
          flexShrink: 0,
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
      >
        <Icon id={icon} />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '17px' }}>{title}</div>
        <div
          style={{
            color: 'var(--muted-foreground)',
            fontWeight: 500,
            fontSize: '14px',
            marginTop: '3px',
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
};

export default IntroScreen;
