import { useState, useId } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import Header from '../components/Header';
import { hapticSelection, hapticNotify } from '../lib/haptics';
import { createAlert, getRoutePoints } from '../lib/api';
import { ApiException } from '../lib/api';

// Экран 12 SPEC: Заявка пассажира
// Форма «нужно к HH:MM туда-то». Маршрут + время прибытия + сколько вас.

const TIME_OPTIONS = ['8:00', '8:30', '9:00', 'другое'];
const PASSENGER_COUNT_OPTIONS = ['1', '2'];

interface PassengerRequestScreenProps {
  onPublish?: () => void;
}

const PassengerRequestScreen: React.FC<PassengerRequestScreenProps> = ({ onPublish }) => {
  const [selectedTime, setSelectedTime] = useState('8:30');
  const [customTime, setCustomTime] = useState('');
  const [passengerCount, setPassengerCount] = useState('1');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customTimeLabelId = useId();

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    hapticSelection();
  };

  const handleCountSelect = (count: string) => {
    setPassengerCount(count);
    hapticSelection();
  };

  const formatTimeToHHMM = (timeStr: string): string => {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return timeStr;
    const hour = parts[0].padStart(2, '0');
    const minute = parts[1];
    return `${hour}:${minute}`;
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setError(null);

    try {
      // Выбрать актуальное время: кастомное (если "другое") или выбранное
      const actualTime = selectedTime === 'другое' ? customTime : selectedTime;

      // Валидация при выборе "другое"
      if (selectedTime === 'другое' && !customTime.trim()) {
        setError('Укажите время прибытия');
        hapticNotify('error');
        setIsPublishing(false);
        return;
      }

      // Резолвинг точек маршрута: Брагино → Центр
      const routePointsRes = await getRoutePoints();
      const points = routePointsRes.points;

      const fromPoint = points.find(
        (p) =>
          p.title.includes('Брагино') ||
          p.district === 'Брагино' ||
          p.title.includes('Урицкого')
      );
      const toPoint = points.find(
        (p) =>
          p.title.includes('Центр') ||
          p.title.includes('Волкова') ||
          p.district === 'Центр'
      );

      if (!fromPoint || !toPoint) {
        throw new Error('Не удалось найти точки маршрута');
      }

      // Получение текущей даты в формате YYYY-MM-DD
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      // Создание заявки через API (форматирование времени в HH:MM)
      await createAlert({
        fromPointId: fromPoint.id,
        toPointId: toPoint.id,
        date: dateStr,
        time: formatTimeToHHMM(actualTime),
      });

      hapticNotify('success');
      onPublish?.();
    } catch (err) {
      console.error('Ошибка публикации заявки:', err);
      let errorMessage = 'Не удалось опубликовать заявку';
      if (err instanceof ApiException) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      hapticNotify('error');
    } finally {
      setIsPublishing(false);
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

        {selectedTime === 'другое' && (
          <div style={{ marginTop: '12px' }}>
            <label htmlFor={customTimeLabelId} style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Укажите время (HH:MM)
            </label>
            <input
              id={customTimeLabelId}
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="focus-ring"
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--secondary)',
                color: 'var(--foreground)',
                fontSize: '15px',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
        )}
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

      {error && (
        <div
          style={{
            padding: '12px',
            background: 'var(--destructive)',
            color: 'var(--destructive-foreground)',
            borderRadius: 'var(--radius-lg)',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div>{error}</div>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: '1px solid currentColor',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              color: 'inherit',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Закрыть
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary" onClick={handlePublish} disabled={isPublishing}>
          {isPublishing ? 'Публикуем...' : 'Опубликовать заявку'}
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
