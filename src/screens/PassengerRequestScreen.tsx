import { useState, useId, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import Header from '../components/Header';
import Select from '../components/ui/Select';
import RouteConnector from '../components/ui/RouteConnector';
import type { SelectOption } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { hapticSelection, hapticNotify } from '../lib/haptics';
import { createAlert, getRoutePoints } from '../lib/api';
import { ApiException } from '../lib/api';
import type { RoutePoint } from '../types/api';

// Экран 12 SPEC: Заявка пассажира
// Форма «нужно к HH:MM туда-то». Маршрут + время прибытия + сколько вас.

const TIME_OPTIONS = ['8:00', '8:30', '9:00', 'другое'];
const PASSENGER_COUNT_OPTIONS = ['1', '2'];

interface PassengerRequestScreenProps {
  direction?: 'morning' | 'evening';
  onPublish?: () => void;
}

const PassengerRequestScreen: React.FC<PassengerRequestScreenProps> = ({
  direction = 'morning',
  onPublish,
}) => {
  const [selectedTime, setSelectedTime] = useState('8:30');
  const [customTime, setCustomTime] = useState('');
  const [passengerCount, setPassengerCount] = useState('1');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customTimeLabelId = useId();

  // Состояние для точек маршрута
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [isLoadingPoints, setIsLoadingPoints] = useState(true);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [fromPointId, setFromPointId] = useState<string>('');
  const [toPointId, setToPointId] = useState<string>('');

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    hapticSelection();
  };

  const handleCountSelect = (count: string) => {
    setPassengerCount(count);
    hapticSelection();
  };

  // Загрузка точек маршрута при монтировании
  useEffect(() => {
    const loadRoutePoints = async () => {
      setIsLoadingPoints(true);
      setPointsError(null);
      try {
        const response = await getRoutePoints();
        setRoutePoints(response.points);

        // Устанавливаем дефолтные значения по направлению
        // morning: Брагино (откуда) → Центр (куда)
        // evening: Центр (откуда) → Брагино (куда)
        const bragino = response.points.find(
          (p) =>
            p.title.includes('Брагино') ||
            p.district === 'Брагино' ||
            p.title.includes('Урицкого')
        );
        const centr = response.points.find(
          (p) =>
            p.title.includes('Центр') ||
            p.title.includes('Волкова') ||
            p.district === 'Центр'
        );

        if (direction === 'morning') {
          // Брагино → Центр
          if (bragino) setFromPointId(String(bragino.id));
          if (centr) setToPointId(String(centr.id));
        } else {
          // Центр → Брагино
          if (centr) setFromPointId(String(centr.id));
          if (bragino) setToPointId(String(bragino.id));
        }
      } catch (err) {
        console.error('Ошибка загрузки точек маршрута:', err);
        setPointsError('Не удалось загрузить точки маршрута');
      } finally {
        setIsLoadingPoints(false);
      }
    };

    loadRoutePoints();
  }, [direction]);

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

      // Валидация точек маршрута
      if (!fromPointId || !toPointId) {
        setError('Выберите точки маршрута');
        hapticNotify('error');
        setIsPublishing(false);
        return;
      }

      if (fromPointId === toPointId) {
        setError('Точки отправления и назначения должны отличаться');
        hapticNotify('error');
        setIsPublishing(false);
        return;
      }

      // Получение текущей даты в формате YYYY-MM-DD
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      // Создание заявки через API (форматирование времени в HH:MM)
      await createAlert({
        fromPointId: Number(fromPointId),
        toPointId: Number(toPointId),
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

      <div style={{ fontSize: '15px', color: 'var(--muted-foreground)' }}>
        Поездок сейчас нет — оставь заявку, и водители этого маршрута увидят, что ты ищешь.
      </div>

      <div>
        <div
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '6px',
          }}
        >
          Маршрут
        </div>

        {isLoadingPoints ? (
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton h={48} r={16} />

              <div
                style={{
                  height: '16px',
                  borderLeft: '2px dotted var(--muted-foreground)',
                  marginLeft: '22px',
                }}
              />

              <Skeleton h={48} r={16} />
            </div>
          </Card>
        ) : pointsError ? (
          <Card>
            <div style={{ fontSize: '15px', color: 'var(--destructive)', padding: '8px 0' }}>
              {pointsError}
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ display: 'flex', gap: '12px' }}>
              <RouteConnector />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    borderRadius: '14px',
                    background: 'var(--field)',
                    border: '1px solid var(--field-border)',
                    boxShadow: 'var(--field-shadow)',
                    padding: '10px 14px',
                  }}
                >
                  <Select
                    options={routePoints.map((point): SelectOption => ({
                      value: String(point.id),
                      label: point.title,
                    }))}
                    value={fromPointId}
                    onChange={(value) => {
                      setFromPointId(value);
                      hapticSelection();
                    }}
                    placeholder="Откуда"
                    aria-label="Точка отправления"
                  />
                </div>

                <div
                  style={{
                    borderRadius: '14px',
                    background: 'var(--field)',
                    border: '1px solid var(--field-border)',
                    boxShadow: 'var(--field-shadow)',
                    padding: '10px 14px',
                  }}
                >
                  <Select
                    options={routePoints.map((point): SelectOption => ({
                      value: String(point.id),
                      label: point.title,
                    }))}
                    value={toPointId}
                    onChange={(value) => {
                      setToPointId(value);
                      hapticSelection();
                    }}
                    placeholder="Куда"
                    aria-label="Точка назначения"
                  />
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div>
        <div
          style={{
            fontSize: '12px',
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
            <label htmlFor={customTimeLabelId} style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
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
            fontSize: '12px',
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
            fontSize: '15px',
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
            fontSize: '12px',
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
