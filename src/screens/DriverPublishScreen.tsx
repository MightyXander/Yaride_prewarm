import { useId, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Header from '../components/Header';
import { hapticSelection } from '../lib/haptics';
import { getMyTemplate, publishTrip, ApiException } from '../lib/api';
import { showToast } from '../lib/toast';
import { Appear } from '../components/Appear';
import type { SelectOption } from '../components/ui/Select';
import type { GetMyTemplateResponse } from '../types/api';

interface DriverPublishScreenProps {
  onPublish: (tripId: number) => void;
  title?: string;
  timeOptions?: string[];
  defaultTime?: string;
  routeFrom?: string;
  routeTo?: string;
  routeLabel?: string;
  defaultPickup?: string;
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
      border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
      background: active ? 'var(--brand)' : 'var(--secondary)',
      color: active ? 'var(--brand-foreground)' : 'var(--secondary-foreground)',
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
  routeFrom = 'Брагино, ул. Урицкого, 12',
  routeTo = 'Центр, пл. Волкова',
  routeLabel = 'Маршрут · из шаблона',
  defaultPickup = 'uritskogo',
}) => {
  const [time, setTime] = useState<string>(defaultTime);
  const [customTime, setCustomTime] = useState<string>('');
  const [seats, setSeats] = useState<number>(3);
  const [pickup, setPickup] = useState<string>(defaultPickup);
  const [template, setTemplate] = useState<GetMyTemplateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<boolean>(false);
  const timeLabelId = useId();
  const seatsLabelId = useId();
  const customTimeLabelId = useId();

  // Загрузить шаблон при монтировании
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoading(true);
        setError(null);
        const tmpl = await getMyTemplate();
        setTemplate(tmpl);
        setSeats(tmpl.seats_total);
      } catch (err) {
        const msg = err instanceof ApiException ? err.message : 'Ошибка загрузки шаблона';
        setError(msg);
        showToast(msg);
      } finally {
        setLoading(false);
      }
    };
    void loadTemplate();
  }, []);

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

    try {
      setPublishing(true);
      const today = new Date().toISOString().split('T')[0];
      const response = await publishTrip({
        templateId: template.id,
        date: today,
        departureTime: formatTimeToHHMM(actualTime),
      });
      onPublish(response.trip.tripId);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Ошибка публикации поездки';
      showToast(msg);
    } finally {
      setPublishing(false);
    }
  };

  // Определяем опции точки сбора в зависимости от дефолта
  const pickupOptions = defaultPickup === 'volkova' ? EVENING_PICKUP_OPTIONS : DEFAULT_PICKUP_OPTIONS;

  const stepBtnStyle = (enabled: boolean): React.CSSProperties => ({
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--secondary)',
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
              {/* Маршрут из шаблона */}
              <Card>
        <div style={sectionLabelStyle}>{routeLabel}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '15px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <span
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                background: 'var(--brand)',
                flexShrink: 0,
              }}
            />
            {routeFrom}
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
              fontSize: '15px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <span
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                flexShrink: 0,
              }}
            />
            {routeTo}
          </div>
        </div>
      </Card>

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

      {/* Точка сбора — Select */}
              <div>
                <Select
                  options={pickupOptions}
                  value={pickup}
                  onChange={setPickup}
                  label="Точка сбора"
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
