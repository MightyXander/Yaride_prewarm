import { useState, useId } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import PhoneField from '../components/PhoneField';
import { hapticNotify } from '../lib/haptics';
import { showToast } from '../lib/toast';
import { createBooking } from '../lib/api';
import { Appear } from '../components/Appear';
import type { Trip } from '../types/navigation';
import type { BookingResult } from '../types/api';

interface BookingProfileScreenProps {
  trip: Trip;
  onConfirm: (booking: BookingResult) => void;
}

// Заглушка имени из Telegram, фолбэк — пусто (покажем инпут)
const getTelegramName = (): string => {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (user?.first_name) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ');
  }
  return '';
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  minHeight: '48px',
  padding: '0 14px',
  borderRadius: '15px',
  background: 'var(--secondary)',
  border: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--foreground)',
};

const BookingProfileScreen: React.FC<BookingProfileScreenProps> = ({ trip, onConfirm }) => {
  const telegramName = getTelegramName();
  const [name, setName] = useState<string>(telegramName);
  // Телефон собирается «по требованию» (issue #267): реальный ввод + сохранение
  // в users.phone. Бронь доступна только когда номер задан (phoneReady).
  const [phoneReady, setPhoneReady] = useState<boolean>(false);
  // Состояния создания брони
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputId = useId();

  const canConfirm = name.trim().length > 0 && phoneReady;

  const handleConfirmBooking = async () => {
    if (trip.isOwn) {
      setError('Нельзя забронировать свою поездку');
      showToast('Нельзя забронировать свою поездку');
      hapticNotify('error');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const tripId = Number(trip.id);
      if (isNaN(tripId)) {
        throw new Error('Некорректный ID поездки');
      }

      const response = await createBooking({ tripId });
      hapticNotify('success');
      onConfirm(response.booking);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать бронь';
      setError(message);
      showToast(message);
      hapticNotify('error');
    } finally {
      setIsCreating(false);
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
      <Header title="Почти готово" />

      {/* Что бронируем */}
      <Appear delay={0}>
        <Card style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '14px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            color: 'var(--brand-foreground)',
            fontSize: '18px',
            flexShrink: 0,
          }}
        >
          {trip.driver.avatar}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Бронируешь {trip.time}</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '2px',
              lineHeight: 1.4,
            }}
          >
            с {trip.driver.name}{trip.car ? ` · ${trip.car}` : ''} · {trip.address}
          </div>
        </div>
        </Card>
      </Appear>

      {/* Имя */}
      <Appear delay={50}>
        <div>
        <label htmlFor={nameInputId} style={{ ...sectionLabelStyle, display: 'block' }}>
          Имя
        </label>
        {telegramName ? (
          <div id={nameInputId} style={fieldStyle}>
            <span>{telegramName}</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted-foreground)',
              }}
            >
              из Telegram
            </span>
          </div>
        ) : (
          <input
            id={nameInputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как тебя звать?"
            className="focus-ring"
            style={{
              ...fieldStyle,
              width: '100%',
              fontFamily: 'var(--font-sans)',
            }}
          />
        )}
        </div>
      </Appear>

      {/* Телефон · сбор «по требованию» (issue #267) — реальный ввод + сохранение */}
      <Appear delay={100}>
        <PhoneField
          label="Телефон для связи"
          hint="Нужен, чтобы водитель мог связаться с тобой по этой поездке."
          onReadyChange={setPhoneReady}
        />
      </Appear>

      {/* Инфо про SOS */}
      <Appear delay={150}>
        <Card variant="accent" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          В поездке будут кнопка <b style={{ fontWeight: 700 }}>SOS</b> и «поделиться с близким».
        </div>
        </Card>
      </Appear>

      <Appear delay={200}>
        <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        {error && (
          <Card variant="accent" style={{ background: 'var(--destructive)', padding: '12px' }}>
            <div style={{ fontSize: '12px', color: 'var(--destructive-foreground)', lineHeight: 1.5 }}>
              <b style={{ fontWeight: 700 }}>Ошибка:</b> {error}
            </div>
          </Card>
        )}
        <Button
          variant="primary"
          onClick={handleConfirmBooking}
          disabled={!canConfirm || isCreating}
        >
          {isCreating ? 'Создаём бронь…' : 'Подтвердить бронь'}
        </Button>
        {error && (
          <Button variant="secondary" onClick={handleConfirmBooking} disabled={isCreating}>
            Повторить попытку
          </Button>
        )}
        <div
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Оплаты в приложении нет — за бензин рассчитаетесь сами
        </div>
        </div>
      </Appear>
    </div>
  );
};

export default BookingProfileScreen;
