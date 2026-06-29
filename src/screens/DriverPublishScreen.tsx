import { useId, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Calendar from '../components/ui/Calendar';
import RouteConnector from '../components/ui/RouteConnector';
import { Icon } from '../components/Icons';
import Header from '../components/Header';
import { hapticSelection } from '../lib/haptics';
import { getMyTemplate, publishTrip, ApiException, getRoutePoints } from '../lib/api';
import { showToast } from '../lib/toast';
import { Appear } from '../components/Appear';
import type { SelectOption } from '../components/ui/Select';
import type { GetMyTemplateResponse, RoutePoint } from '../types/api';

interface DriverPublishScreenProps {
  onPublish: (tripId: number) => void;
  title?: string;
  timeOptions?: string[];
  defaultTime?: string;
  routeLabel?: string;
  defaultPickup?: string;
  reverse?: boolean;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const DEFAULT_TIME_OPTIONS = ['7:30', '7:40', '7:55', '8:10', 'другое'];
const MIN_SEATS = 1;
const MAX_SEATS = 4;

const DEFAULT_PICKUP_OPTIONS: SelectOption[] = [
  { value: 'uritskogo', label: 'ул. Урицкого, 12' },
  { value: 'dzerzhinskogo', label: 'пр-т Дзержинского, 8' },
  { value: 'svobody', label: 'ул. Свободы, 60' },
  { value: 'leningradsky', label: 'Ленинградский пр-т, 40' },
];

const EVENING_PICKUP_OPTIONS: SelectOption[] = [
  { value: 'volkova', label: 'пл. Волкова, у фонтана' },
  { value: 'svobody', label: 'ул. Свободы, 60' },
  { value: 'dzerzhinskogo', label: 'пр-т Дзержинского, 8' },
];

interface SelectableChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const SelectableChip: React.FC<SelectableChipProps> = ({ label, active, onClick }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={() => {
      if (!active) hapticSelection();
      onClick();
    }}
    className="focus-ring pressable"
    style={{
      minHeight: '44px',
      padding: '6px 14px',
      borderRadius: '999px',
      fontSize: '15px',
      fontWeight: 700,
      fontFamily: 'var(--font-sans)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      border: `1px solid ${active ? 'var(--brand)' : 'var(--field-border)'}`,
      background: active ? 'var(--brand)' : 'var(--field)',
      color: active ? 'var(--brand-foreground)' : 'var(--secondary-foreground)',
      boxShadow: active ? '0 4px 14px -4px rgba(255, 210, 40, 0.55)' : 'var(--field-shadow)',
    }}
  >
    {label}
  </button>
);

const DriverPublishScreen: React.FC<DriverPublishScreenProps> = ({
  onPublish,
  title = 'Я за рулём',
  timeOptions = DEFAULT_TIME_OPTIONS,
  defaultTime = '7:40',
  routeLabel = 'Маршрут · из шаблона',
  defaultPickup = 'uritskogo',
  reverse = false,
}) => {
  const [time, setTime] = useState<string>(defaultTime);
  const [customTime, setCustomTime] = useState<string>('');
  const [seats, setSeats] = useState<number>(3);
  const [pickup, setPickup] = useState<string>(defaultPickup);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [template, setTemplate] = useState<GetMyTemplateResponse | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<boolean>(false);
  const timeLabelId = useId();
  const seatsLabelId = useId();
  const customTimeLabelId = useId();
  const dateLabelId = useId();

  // Загрузить шаблон и route points при монтировании
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [tmpl, pointsResp] = await Promise.all([
          getMyTemplate(),
          getRoutePoints(),
        ]);
        setTemplate(tmpl);
        setRoutePoints(pointsResp.points);
        setSeats(tmpl.seats_total);
      } catch (err) {
        const msg = err instanceof ApiException ? err.message : 'Ошибка загрузки данных';
        setError(msg);
        showToast(msg);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [reverse]);

  // Форматирование времени в HH:MM (паддинг часа до 2 цифр)
  const formatTimeToHHMM = (timeStr: string): string => {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return timeStr;
    const hour = parts[0].padStart(2, '0');
    const minute = parts[1];
    return `${hour}:${minute}`;
  };

  const handlePublish = async () => {
    if (!template) return;

    // Выбрать актуальное время: кастомное (если "другое") или выбранное
    const actualTime = time === 'другое' ? customTime : time;

    // Валидация при выборе "другое"
    if (time === 'другое' && !customTime.trim()) {
      showToast('Укажите время выезда');
      return;
    }

    // Направление зафиксировано пропом reverse — экран открыт уже в нужную сторону.
    try {
      setPublishing(true);
      const response = await publishTrip({
        templateId: template.id,
        date,
        departureTime: formatTimeToHHMM(actualTime),
        reverse,
      });
      onPublish(response.trip.tripId);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Ошибка публикации поездки';
      showToast(msg);
    } finally {
      setPublishing(false);
    }
  };

  // Направление зафиксировано пропом reverse — экран открыт уже в нужную сторону.
  // Origin/destination — конечные точки коридора из шаблона.
  const originPointId = template ? (reverse ? template.end_point_id : template.start_point_id) : null;
  const destPointId = template ? (reverse ? template.start_point_id : template.end_point_id) : null;
  const originPoint = routePoints.find((p) => p.id === originPointId) ?? null;
  const destPoint = routePoints.find((p) => p.id === destPointId) ?? null;
  const originDistrict = originPoint?.district ?? (reverse ? 'Центр' : 'Брагино');
  const destLabel = destPoint
    ? `${destPoint.district}, ${destPoint.title}`
    : reverse
      ? 'Брагино'
      : 'Центр, пл. Волкова';

  // Единственное поле выбора — улица в районе отправления (направление уже задано,
  // район понятен, поэтому отдельного поля «Точка сбора» больше нет).
  const pickupOptions = defaultPickup === 'volkova' ? EVENING_PICKUP_OPTIONS : DEFAULT_PICKUP_OPTIONS;
  const streetOptions: SelectOption[] = pickupOptions.map((o) => ({
    value: o.value,
    label: `${originDistrict}, ${o.label}`,
  }));

  const stepBtnStyle = (enabled: boolean): React.CSSProperties => ({
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    border: '1px solid var(--field-border)',
    background: 'var(--field)',
    boxShadow: 'var(--field-shadow)',
    color: 'var(--foreground)',
    display: 'grid',
    placeItems: 'center',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.45,
    fontFamily: 'var(--font-sans)',
  });

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
      <Header title={title} />

      <AnimatePresence mode="wait">
        {loading ? (
          <Appear key="loading" instant>
            <div
              style={{
                fontSize: '15px',
                color: 'var(--muted-foreground)',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              Загрузка шаблона...
            </div>
          </Appear>
        ) : error ? (
          <Appear key="error" animateKey="error">
            <Card variant="accent" style={{ borderColor: 'var(--destructive)', background: 'var(--destructive-background, var(--secondary))' }}>
              <div style={{ fontSize: '15px', lineHeight: 1.5, color: 'var(--destructive)' }}>
                {error}
              </div>
            </Card>
          </Appear>
        ) : (
          <Appear key="content" animateKey="content">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Маршрут из шаблона — интерактивный */}
              <Card>
                <div style={sectionLabelStyle}>{routeLabel}</div>
                <div style={{ display: 'flex', gap: '12px', margin: '4px 0' }}>
                  <RouteConnector />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Первая точка — inline Select с белым фоном */}
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
                        options={streetOptions}
                        value={pickup}
                        onChange={(val) => {
                          hapticSelection();
                          setPickup(val);
                        }}
                        aria-label="Откуда забрать"
                      />
                    </div>

                    {/* Вторая точка — read-only с пунктирной рамкой и замком */}
                    <div
                      style={{
                        borderRadius: '14px',
                        background: 'var(--field)',
                        border: '1.5px dashed var(--field-border)',
                        boxShadow: 'var(--field-shadow)',
                        padding: '14px',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: 'var(--muted-foreground)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <Icon
                        id="i-lock"
                        style={{
                          width: '16px',
                          height: '16px',
                          flexShrink: 0,
                          opacity: 0.6,
                        }}
                      />
                      {destLabel}
                    </div>
                  </div>
                </div>
              </Card>

      {/* Дата выезда */}
      <div role="group" aria-labelledby={dateLabelId}>
        <div id={dateLabelId} style={sectionLabelStyle}>Дата выезда</div>
        <button
          type="button"
          onClick={() => {
            hapticSelection();
            setShowCalendar(!showCalendar);
          }}
          className="focus-ring pressable"
          aria-expanded={showCalendar}
          style={{
            width: '100%',
            minHeight: '48px',
            padding: '12px 16px',
            borderRadius: '16px',
            border: '1px solid var(--field-border)',
            background: 'var(--field)',
            boxShadow: 'var(--field-shadow)',
            color: 'var(--foreground)',
            fontSize: '15px',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <span
            style={{
              transform: showCalendar ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            ▼
          </span>
        </button>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: showCalendar ? '1fr' : '0fr',
            opacity: showCalendar ? 1 : 0,
            transition: 'grid-template-rows 0.24s ease-out, opacity 0.24s ease-out',
            marginTop: showCalendar ? '12px' : 0,
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <Card>
              <Calendar
                value={date}
                onChange={(newDate) => {
                  setDate(newDate);
                  setShowCalendar(false);
                }}
              />
            </Card>
          </div>
        </div>
      </div>

      {/* Время — чипами */}
      <div role="group" aria-labelledby={timeLabelId}>
        <div id={timeLabelId} style={sectionLabelStyle}>Когда выезжаешь?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {timeOptions.map((t) => (
            <SelectableChip key={t} label={t} active={time === t} onClick={() => setTime(t)} />
          ))}
        </div>

        {/* Кастомный ввод времени при выборе "другое" */}
        {time === 'другое' && (
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
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: '12px',
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

      {/* Число мест — степпер */}
      <div role="group" aria-labelledby={seatsLabelId}>
        <div id={seatsLabelId} style={sectionLabelStyle}>Сколько возьмёшь?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            aria-label="Меньше мест"
            className="focus-ring pressable"
            disabled={seats <= MIN_SEATS}
            onClick={() => {
              hapticSelection();
              setSeats((s) => Math.max(MIN_SEATS, s - 1));
            }}
            style={stepBtnStyle(seats > MIN_SEATS)}
          >
            <span style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1 }}>−</span>
          </button>
          <div
            aria-live="polite"
            style={{
              minWidth: '64px',
              textAlign: 'center',
              fontSize: '17px',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {seats} {seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест'}
          </div>
          <button
            type="button"
            aria-label="Больше мест"
            className="focus-ring pressable"
            disabled={seats >= MAX_SEATS}
            onClick={() => {
              hapticSelection();
              setSeats((s) => Math.min(MAX_SEATS, s + 1));
            }}
            style={stepBtnStyle(seats < MAX_SEATS)}
          >
            <span style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1 }}>+</span>
          </button>
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
                <Button
                  variant="primary"
                  icon="i-car"
                  onClick={handlePublish}
                  disabled={publishing}
                >
                  {publishing ? 'Публикация...' : 'Опубликовать поездку'}
                </Button>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted-foreground)',
                    textAlign: 'center',
                    lineHeight: 1.5,
                  }}
                >
                  Пассажиры увидят поездку и смогут забронировать место
                </div>
              </div>
            </div>
          </Appear>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DriverPublishScreen;
