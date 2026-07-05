import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Toggle from '../components/ui/Toggle';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { getMySafety, saveMySafety, ApiException } from '../lib/api';
import type { TrustedContact } from '../types/api';
import { showToast } from '../lib/toast';

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '46px',
  padding: '0 14px',
  borderRadius: '14px',
  background: 'var(--field)',
  border: '1px solid var(--field-border)',
  boxShadow: 'var(--field-shadow)',
  color: 'var(--foreground)',
  fontSize: '15px',
  fontWeight: 600,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  boxSizing: 'border-box',
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
  // Дефолты совпадают с серверными (см. GET /api/me/safety) — до ответа сети
  // тумблеры уже показывают корректное для нового пользователя состояние.
  const [sosEnabled, setSosEnabled] = useState(true);
  const [autoShare, setAutoShare] = useState(false);
  const [womenOnly, setWomenOnly] = useState(true);
  const [trustedContact, setTrustedContact] = useState<TrustedContact | null>(null);

  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Загрузка реального состояния при маунте (issue #344, срез 1 из #323).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMySafety();
        if (cancelled) return;
        setSosEnabled(res.sosEnabled);
        setAutoShare(res.autoShare);
        setWomenOnly(res.womenOnly);
        setTrustedContact(res.trustedContact);
      } catch {
        // Тихо остаёмся на дефолтах — следующее переключение тумблера всё равно
        // отправит PUT с актуальным полным состоянием.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Тумблер шлёт PUT сразу при переключении; ошибка — откат значения + toast. */
  const persistToggle = async (
    field: 'sosEnabled' | 'autoShare' | 'womenOnly',
    value: boolean,
  ) => {
    const prev = { sosEnabled, autoShare, womenOnly };
    const next = { ...prev, [field]: value };
    setSosEnabled(next.sosEnabled);
    setAutoShare(next.autoShare);
    setWomenOnly(next.womenOnly);
    try {
      await saveMySafety({ ...next, trustedContact });
    } catch {
      setSosEnabled(prev.sosEnabled);
      setAutoShare(prev.autoShare);
      setWomenOnly(prev.womenOnly);
      showToast('Не удалось сохранить настройку');
    }
  };

  const openContactForm = () => {
    setContactName(trustedContact?.name ?? '');
    setContactPhone(trustedContact?.phone ?? '');
    setShowContactForm(true);
  };

  const handleSaveContact = async () => {
    const name = contactName.trim();
    const phone = contactPhone.trim();
    if (!name || !phone) {
      showToast('Укажите имя и телефон контакта');
      return;
    }
    setSavingContact(true);
    try {
      const result = await saveMySafety({
        sosEnabled,
        autoShare,
        womenOnly,
        trustedContact: { name, phone },
      });
      setTrustedContact(result.trustedContact);
      setShowContactForm(false);
    } catch (e) {
      showToast(
        e instanceof ApiException && e.message === 'invalid_phone'
          ? 'Введите корректный номер телефона'
          : 'Не удалось сохранить контакт',
      );
    } finally {
      setSavingContact(false);
    }
  };

  const handleRemoveContact = async () => {
    setSavingContact(true);
    try {
      const result = await saveMySafety({ sosEnabled, autoShare, womenOnly, trustedContact: null });
      setTrustedContact(result.trustedContact);
      setShowContactForm(false);
      setContactName('');
      setContactPhone('');
    } catch {
      showToast('Не удалось убрать контакт');
    } finally {
      setSavingContact(false);
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
      <Header title="Безопасность" />

      {/* Переключатели безопасности */}
      <Card style={{ padding: '4px 14px' }}>
        <SafetyRow
          icon="i-sos"
          title="Кнопка SOS в поездке"
          checked={sosEnabled}
          onChange={(v) => persistToggle('sosEnabled', v)}
        />
        <div style={{ height: '1px', background: 'var(--border)' }} />
        <SafetyRow
          icon="i-pin"
          title="Авто-делиться поездкой"
          hint="Близкий видит маршрут автоматически"
          checked={autoShare}
          onChange={(v) => persistToggle('autoShare', v)}
        />
        <div style={{ height: '1px', background: 'var(--border)' }} />
        <SafetyRow
          icon="i-user"
          title="Только женский состав"
          hint="Показывать поездки с женщинами-водителями"
          checked={womenOnly}
          onChange={(v) => persistToggle('womenOnly', v)}
        />
      </Card>

      {/* Доверенный контакт */}
      <div>
        <div style={sectionLabelStyle}>Доверенный контакт</div>
        <Card
          style={
            showContactForm
              ? { display: 'flex', flexDirection: 'column', gap: '10px' }
              : { display: 'flex', gap: '12px', alignItems: 'center' }
          }
        >
          {showContactForm ? (
            <>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Имя"
                className="focus-ring"
                style={fieldStyle}
              />
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Телефон"
                inputMode="tel"
                className="focus-ring"
                style={fieldStyle}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="primary"
                  onClick={handleSaveContact}
                  disabled={savingContact}
                  style={{ flex: 1, minHeight: '40px', padding: '6px 14px' }}
                >
                  {savingContact ? 'Сохраняем…' : 'Сохранить'}
                </Button>
                {trustedContact !== null && (
                  <Button
                    variant="secondary"
                    onClick={handleRemoveContact}
                    disabled={savingContact}
                    style={{ minHeight: '40px', padding: '6px 14px' }}
                  >
                    Убрать
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setShowContactForm(false)}
                  disabled={savingContact}
                  style={{ minHeight: '40px', padding: '6px 14px' }}
                >
                  Отмена
                </Button>
              </div>
            </>
          ) : (
            <>
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
                {trustedContact !== null ? (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{trustedContact.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                      {trustedContact.phone}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Не добавлен
                  </div>
                )}
              </div>
              <Button
                variant="secondary"
                onClick={openContactForm}
                style={{ minHeight: '40px', padding: '6px 14px', flexShrink: 0 }}
              >
                {trustedContact !== null ? 'Изменить' : 'Добавить'}
              </Button>
            </>
          )}
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
