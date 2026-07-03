import { useState, useId, useEffect, useCallback } from 'react';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import Select from '../components/ui/Select';
import { RouteDot, RouteMidConnector } from '../components/ui/RouteConnector';
import { LoadErrorState } from '../components/ui/StateView';
import type { SelectOption } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { hapticSelection, hapticNotify } from '../lib/haptics';
import { createAlert, getRoutePoints } from '../lib/api';
import { ApiException } from '../lib/api';
import { showToast } from '../lib/toast';
import { localDateStr, validateDeparture, DEPARTURE_ERROR_MESSAGES } from '../lib/dateLocal';
import type { RoutePoint } from '../types/api';

// Экран 12 SPEC: Заявка пассажира
// Форма «нужно к HH:MM туда-то». Маршрут + время прибытия + сколько вас.

const TIME_OPTIONS = ['8:00', '8:30', '9:00', 'другое'];
const PASSENGER_COUNT_OPTIONS = ['1', '2'];

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

interface PassengerRequestScreenProps {
  direction?: 'morning' | 'evening';
  // alertId созданной заявки — прокидывается в навигацию на request-published,
  // чтобы кнопка «Отменить» там знала, какую заявку отменять (issue #319).
  onPublish?: (alertId: number) => void;
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

  const handleSwapDirection = () => {
    hapticSelection();
    const temp = fromPointId;
    setFromPointId(toPointId);
    setToPointId(temp);
  };

  // Загрузка точек маршрута (вынесена для повторного вызова из состояния ошибки)
  const loadRoutePoints = useCallback(async () => {
      setIsLoadingPoints(true);
      setPointsError(null);
      try {
        const response = await getRoutePoints();
        setRoutePoints(response.points);

        // Устанавливаем дефолтные значения по направлению
        // morning: Брагино (откуда) → Центр (куда)
        // evening: Центр (откуда) → Брагино (куда)
        // Пассажир выбирает только анкеры-районы (issue #331: эвристика упрощена
        // до parent_point_id === null — конкретные остановки внутри района
        // выбирает водитель, здесь всегда район целиком).
        const bragino = response.points.find(
          (p) => p.parent_point_id === null && p.title === 'Брагино'
        );
        const centr = response.points.find(
          (p) => p.parent_point_id === null && p.title === 'Центр'
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
  }, [direction]);

  useEffect(() => {
    void loadRoutePoints();
  }, [loadRoutePoints]);

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

      // Получение текущей локальной даты в формате YYYY-MM-DD (issue #330:
      // toISOString() конвертирует в UTC и откатывает дату на вчера ночью).
      const dateStr = localDateStr();

      // Нельзя оставить заявку на прошедшее время или менее чем за 10 минут
      // до выезда (issue #330).
      const departureIssue = validateDeparture(dateStr, formatTimeToHHMM(actualTime));
      if (departureIssue !== null) {
        showToast(DEPARTURE_ERROR_MESSAGES[departureIssue]);
        setIsPublishing(false);
        return;
      }

      // Создание заявки через API (форматирование времени в HH:MM)
      const response = await createAlert({
        fromPointId: Number(fromPointId),
        toPointId: Number(toPointId),
        date: dateStr,
        time: formatTimeToHHMM(actualTime),
      });

      hapticNotify('success');
      onPublish?.(response.alert.alertId);
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

  // Пассажир по-прежнему выбирает только район→район (issue #331): Select-ы
  // заявки ограничены анкерами (parent_point_id === null), конкретные остановки
  // внутри района — только у водителя при публикации поездки.
  const anchorOptions: SelectOption[] = routePoints
    .filter((point) => point.parent_point_id === null)
    .map((point): SelectOption => ({ value: String(point.id), label: point.title }));

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
        <div style={sectionLabelStyle}>Маршрут</div>

        {isLoadingPoints ? (
          <div
            style={{
              background: 'var(--elevated)',
              borderRadius: 'var(--radius-xl)',
              padding: '16px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '48px' }}>
                <RouteDot filled />
                <div style={{ flex: 1, minWidth: 0 }}><Skeleton h={48} r={18} /></div>
              </div>
              <RouteMidConnector />
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '48px' }}>
                <RouteDot />
                <div style={{ flex: 1, minWidth: 0 }}><Skeleton h={48} r={18} /></div>
              </div>
            </div>
          </div>
        ) : pointsError ? (
          <LoadErrorState
            subtitle="Не удалось загрузить точки маршрута. Проверь соединение и попробуй ещё раз."
            onRetry={() => { void loadRoutePoints(); }}
          />
        ) : (
          <div
            style={{
              background: 'var(--elevated)',
              borderRadius: 'var(--radius-xl)',
              padding: '16px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-card)',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingRight: '48px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '48px' }}>
                <RouteDot filled />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Select
                    variant="field"
                    options={anchorOptions}
                    value={fromPointId}
                    onChange={(value) => {
                      setFromPointId(value);
                      hapticSelection();
                    }}
                    placeholder="Откуда"
                    aria-label="Точка отправления"
                  />
                </div>
              </div>

              <RouteMidConnector />

              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '48px' }}>
                <RouteDot />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Select
                    variant="field"
                    options={anchorOptions}
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

            {/* Swap-кнопка направления */}
            <button
              type="button"
              onClick={handleSwapDirection}
              aria-label="Поменять направление"
              className="focus-ring pressable"
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 5,
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'var(--field)',
                border: '1px solid var(--field-border)',
                boxShadow: 'var(--shadow-card)',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 4v16M7 4L4 7m3-3l3 3M17 20V4m0 16l3-3m-3 3l-3-3" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div>
        <div style={sectionLabelStyle}>Когда нужно быть на месте</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TIME_OPTIONS.map((time) => (
            <button
              key={time}
              type="button"
              aria-pressed={selectedTime === time}
              onClick={() => handleTimeSelect(time)}
              className="focus-ring pressable"
              style={{
                height: '44px',
                minWidth: '60px',
                padding: '0 16px',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                border: selectedTime === time ? 'none' : '1px solid var(--field-border)',
                background: selectedTime === time ? 'var(--gradient-brand)' : 'var(--field)',
                color: selectedTime === time ? 'var(--brand-foreground)' : 'var(--secondary-foreground)',
                boxShadow: selectedTime === time ? 'var(--shadow-hero)' : 'var(--field-shadow)',
              }}
            >
              {time}
            </button>
          ))}
        </div>

        {selectedTime === 'другое' && (
          <div style={{ marginTop: '12px' }}>
            <label htmlFor={customTimeLabelId} style={{ ...sectionLabelStyle, display: 'block' }}>
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
                minHeight: '48px',
                padding: '0 16px',
                borderRadius: '18px',
                border: '1px solid var(--field-border)',
                background: 'var(--field)',
                boxShadow: 'var(--field-shadow)',
                color: 'var(--foreground)',
                fontSize: '15px',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
        )}
      </div>

      <div>
        <div style={sectionLabelStyle}>Сколько вас</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PASSENGER_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={passengerCount === count}
              onClick={() => handleCountSelect(count)}
              className="focus-ring pressable"
              style={{
                height: '44px',
                minWidth: '60px',
                padding: '0 16px',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                border: passengerCount === count ? 'none' : '1px solid var(--field-border)',
                background: passengerCount === count ? 'var(--gradient-brand)' : 'var(--field)',
                color: passengerCount === count ? 'var(--brand-foreground)' : 'var(--secondary-foreground)',
                boxShadow: passengerCount === count ? 'var(--shadow-hero)' : 'var(--field-shadow)',
              }}
            >
              {count}
            </button>
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
