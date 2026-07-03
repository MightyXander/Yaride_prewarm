import { useEffect, useState } from 'react';
import { Icon } from '../components/Icons';
import ConsentGate from '../components/ConsentGate';
import { hapticImpact } from '../lib/haptics';
import { getMyConsent, setMyConsent } from '../lib/api';
import { OFFER_VERSION, POLICY_VERSION } from '../lib/policy';
import type { UserRole } from '../lib/role';

/**
 * IntroScreen — первый вход: согласие 152-ФЗ (issue #234) + выбор роли (пассажир/водитель).
 * Стиль приведён к остальному приложению:
 *  - карточки ролей на --elevated + --shadow-card;
 *  - выбранная: фон --accent, бренд-граница, иконка на --gradient-brand с --brand-foreground;
 *  - кнопка «Продолжить»: --gradient-brand + --brand-foreground + --shadow-hero.
 * Только inline-стили + токены тем. Без новых зависимостей.
 *
 * Согласие (issue #234 — главный фикс блокера 152-ФЗ для Telegram-юзеров):
 * до выбора роли проверяем GET /api/me/consent. Если версия согласия не совпадает
 * с текущей (POLICY_VERSION/OFFER_VERSION) или согласия ещё нет — показываем
 * ConsentGate вместо выбора роли; JIT-профиль Telegram-юзера (ensureUser) при этом
 * уже создан самим запросом /api/me/consent, но БЕЗ согласия — его пишет отдельный
 * POST /api/me/consent при принятии. Ошибку проверки (сеть/дев-режим без бэкенда)
 * не блокируем — fail-open, чтобы не забаррикадировать вход в Сервис.
 */
interface IntroScreenProps {
  onRoleSelect: (role: UserRole) => void;
}

type ConsentState = 'checking' | 'required' | 'granted';

const IntroScreen: React.FC<IntroScreenProps> = ({ onRoleSelect }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('passenger');
  const [consentState, setConsentState] = useState<ConsentState>('checking');

  useEffect(() => {
    let cancelled = false;
    getMyConsent()
      .then((res) => {
        if (cancelled) return;
        const upToDate =
          res.pdnConsentVersion === POLICY_VERSION && res.offerConsentVersion === OFFER_VERSION;
        setConsentState(upToDate ? 'granted' : 'required');
      })
      .catch(() => {
        // Fail-open: не блокируем вход в Сервис, если проверка недоступна
        // (сеть/дев-режим без бэкенда). Согласие останется незафиксированным
        // до следующей успешной проверки — но не режет доступ к приложению.
        if (!cancelled) setConsentState('granted');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAcceptConsent = async () => {
    await setMyConsent({ pdnConsentVersion: POLICY_VERSION, offerConsentVersion: OFFER_VERSION });
    setConsentState('granted');
  };

  const handleSelect = (role: UserRole) => {
    setSelectedRole(role);
    hapticImpact('medium');
  };

  const handleContinue = () => {
    hapticImpact('light');
    onRoleSelect(selectedRole);
  };

  const handleKeyDown = (role: UserRole, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(role);
    } else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      handleSelect(role === 'passenger' ? 'driver' : 'passenger');
    }
  };

  // Пока идёт проверка согласия — пустой каркас экрана (без мигания ролей до
  // ответа сервера). Запрос идёт на тот же origin и обычно укладывается в один
  // кадр; отдельный скелетон ради этого не заводим (issue #234).
  if (consentState === 'checking') {
    return <div style={{ flex: 1 }} />;
  }

  if (consentState === 'required') {
    return <ConsentGate onAccept={handleAcceptConsent} />;
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '18px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <img
        src="/brand/icon-192.png"
        alt="поехали вместе"
        width={48}
        height={48}
        style={{ width: '48px', height: '48px', borderRadius: '13px', display: 'block', marginTop: '4px' }}
      />
      <div style={{ fontSize: '28px', lineHeight: 1.12, marginTop: '4px', fontWeight: 800, letterSpacing: '-0.01em' }}>
        Выбери роль
      </div>
      <div style={{ fontSize: '15px', marginTop: '-2px', color: 'var(--muted-foreground)' }}>
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

      <div role="radiogroup" aria-labelledby="role-group-label" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
        <button
          onClick={handleContinue}
          className="focus-ring pressable"
          style={{
            minHeight: '52px',
            padding: '0 18px',
            borderRadius: '16px',
            background: 'var(--gradient-brand)',
            color: 'var(--brand-foreground)',
            fontSize: '15px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            boxShadow: 'var(--shadow-hero)',
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

const RoleOption: React.FC<RoleOptionProps> = ({ selected, icon, title, subtitle, onSelect, onKeyDown }) => {
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
        background: selected ? 'var(--accent)' : 'var(--elevated)',
        border: `1px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
        boxShadow: 'var(--shadow-card)',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: selected ? 'var(--gradient-brand)' : 'var(--secondary)',
          color: selected ? 'var(--brand-foreground)' : 'var(--muted-foreground)',
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
        <div style={{ color: 'var(--muted-foreground)', fontWeight: 500, fontSize: '14px', marginTop: '3px' }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
};

export default IntroScreen;
