import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import Header from '../components/Header';
import { hapticSelection, hapticNotify } from '../lib/haptics';

// Экран 12 SPEC: Заявка пассажира
// Форма «нужно к HH:MM туда-то». Маршрут + время прибытия + сколько вас.

const TIME_OPTIONS = ['8:00', '8:30', '9:00', 'другое'];
const PASSENGER_COUNT_OPTIONS = ['1', '2'];

interface PassengerRequestScreenProps {
  onPublish?: () => void;
}

const PassengerRequestScreen: React.FC<PassengerRequestScreenProps> = ({ onPublish }) => {
  const [selectedTime, setSelectedTime] = useState('8:30');
  const [passengerCount, setPassengerCount] = useState('1');

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    hapticSelection();
  };

  const handleCountSelect = (count: string) => {
    setPassengerCount(count);
    hapticSelection();
  };

  const handlePublish = () => {
    hapticNotify('success');
    onPublish?.();
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
      <Header title="Оставить заявку" />

      <div style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>
        Поездок сейчас нет — оставь заявку, и водители этого маршрута увидят, что ты ищешь.
      </div>

      <Card>
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '6px',
          }}
        >
          Маршрут
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '13px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <div
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                background: 'var(--brand)',
                flexShrink: 0,
              }}
            />
            Брагино, ул. Урицкого, 12
          </div>
          <div
            style={{
              height: '16px',
              borderLeft: '2px dotted var(--muted-foreground)',
              marginLeft: '4.5px',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '13px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <div
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                background: 'var(--brand)',
                flexShrink: 0,
              }}
            />
            Центр, пл. Волкова
          </div>
        </div>
      </Card>

      <div>
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '6px',
          }}
        >
          Когда нужно быть на месте
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TIME_OPTIONS.map((time) => (
            <Chip
              key={time}
              label={time}
              selected={selectedTime === time}
              onClick={() => handleTimeSelect(time)}
            />
          ))}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '6px',
          }}
        >
          Сколько вас
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PASSENGER_COUNT_OPTIONS.map((count) => (
            <Chip
              key={count}
              label={count}
              selected={passengerCount === count}
              onClick={() => handleCountSelect(count)}
            />
          ))}
        </div>
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
        <Button variant="primary" onClick={handlePublish}>
          Опубликовать заявку
        </Button>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Пришлём пуш, как только кто-то откликнется
        </div>
      </div>
    </div>
  );
};

export default PassengerRequestScreen;
