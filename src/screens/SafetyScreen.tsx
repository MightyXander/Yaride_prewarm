import { useState } from 'react';
import Card from '../components/ui/Card';
import Toggle from '../components/ui/Toggle';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { Slot } from '../components/ui/Skeleton';
import PhoneField from '../components/PhoneField';
import GenderSelect from '../components/ui/GenderSelect';
import { saveMySafety, ApiException } from '../lib/api';
import { useScreenData, useDelayedFlag } from '../hooks/useScreenData';
import { fetchSafety, DEFAULT_SAFETY } from '../lib/screenFetchers';
import type { GetMySafetyResponse } from '../types/api';
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
  disabled?: boolean;
}

const SafetyRow: React.FC<SafetyRowProps> = ({ icon, title, hint, checked, onChange, disabled }) => (
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
    <Toggle checked={checked} onChange={onChange} disabled={disabled} aria-label={title} />
  </div>
);

const SafetyScreen: React.FC = () => {
  // Дефолты совпадают с серверными (см. GET /api/me/safety) — до ответа сети
  // тумблеры уже показывают корректное для нового пользователя состояние.
  // useScreenData сам тихо остаётся на DEFAULT_SAFETY при ошибке (см. fetchSafety) —
  // здесь никакого отдельного error-состояния не нужно, как и раньше (issue #344).
  const { data: safety, loading, mutate } = useScreenData<GetMySafetyResponse>('safety', fetchSafety);
  const showSkeleton = useDelayedFlag(loading, 180);

  const sosEnabled = safety?.sosEnabled ?? DEFAULT_SAFETY.sosEnabled;
  const autoShare = safety?.autoShare ?? DEFAULT_SAFETY.autoShare;
  const womenOnly = safety?.womenOnly ?? DEFAULT_SAFETY.womenOnly;
  const trustedContact = safety?.trustedContact ?? DEFAULT_SAFETY.trustedContact;
  const sex = safety?.sex ?? DEFAULT_SAFETY.sex;

  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  /** Тумблер шлёт PUT сразу при переключении; ошибка — откат значения + toast. */
  const persistToggle = async (
    field: 'sosEnabled' | 'autoShare' | 'womenOnly',
    value: boolean,
  ) => {
    const prev = { sosEnabled, autoShare, womenOnly, trustedContact, sex };
    const next = { ...prev, [field]: value };
    mutate(next);
    try {
      const result = await saveMySafety({ ...next, trustedContact });
      mutate(result);
    } catch {
      mutate(prev);
      showToast('Не удалось сохранить настройку');
    }
  };

  /** Смена пола (issue #447): оптимистично + PUT полного состояния; ошибка — откат + toast. */
  const persistSex = async (next: 'male' | 'female') => {
    const prev = { sosEnabled, autoShare, womenOnly, trustedContact, sex };
    mutate({ ...prev, sex: next });
    try {
      const result = await saveMySafety({ ...prev, sex: next });
      mutate(result);
    } catch {
      mutate(prev);
      showToast('Не удалось сохранить пол');
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
        sex,
      });
      mutate(result);
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
      const result = await saveMySafety({ sosEnabled, autoShare, womenOnly, trustedContact: null, sex });
      mutate(result);
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

      {/* Пол (issue #447): первый блок — это условие женского режима, а не «личные
          данные»; стоит над тумблерами. Оптимистичный апдейт как persistToggle. */}
      <div>
        <div style={sectionLabelStyle}>Пол</div>
        <Card style={{ padding: '14px 16px' }}>
          <GenderSelect
            value={sex}
            onChange={persistSex}
            label={null}
            hint={
              sex === 'unknown'
                ? 'Укажите пол, чтобы включить женские поездки.'
                : 'Влияет на режим женских поездок.'
            }
          />
        </Card>
      </div>

      {/* Переключатели безопасности — Slot-кроссфейд лечит «дефолты→реальные»
          мигание (issue #352): маска показывается только если загрузка длится
          дольше 180мс (showSkeleton), иначе дефолты видны сразу без мерцания. */}
      <Slot ready={!showSkeleton} block r={18}>
        <Card style={{ padding: '4px 14px' }}>
          <SafetyRow
            icon="i-sos"
            title="Кнопка SOS в поездке"
            checked={sosEnabled}
            onChange={(v) => persistToggle('sosEnabled', v)}
            disabled={loading}
          />
          <div style={{ height: '1px', background: 'var(--border)' }} />
          <SafetyRow
            icon="i-pin"
            title="Авто-делиться поездкой"
            hint="Близкий видит маршрут автоматически"
            checked={autoShare}
            onChange={(v) => persistToggle('autoShare', v)}
            disabled={loading}
          />
          <div style={{ height: '1px', background: 'var(--border)' }} />
          <SafetyRow
            icon="i-user"
            title="Только женский состав"
            hint="Показывать поездки с женщинами-водителями"
            checked={womenOnly}
            onChange={(v) => persistToggle('womenOnly', v)}
            disabled={loading}
          />
        </Card>
      </Slot>

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

      {/* Подтверждение телефона (issue #389): встраиваем PhoneField — тот же
          flashcall-флоу, что на публикации поездки и брони (issue #328).
          Статус «сохранён»/«подтверждён» и «Изменить номер» рендерит сам
          компонент, отдельный бэйдж здесь не нужен. */}
      <div>
        <PhoneField
          label="Телефон"
          hint="Нужен для связи в поездке и для SOS-оповещения."
        />
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
