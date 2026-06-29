import { useId, useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Calendar from '../components/ui/Calendar';
import RouteConnector from '../components/ui/RouteConnector';
import { Icon } from '../components/Icons';
import Header from '../components/Header';
import { hapticSelection } from '../lib/haptics';
import { getMyTemplate, publishTrip, ApiException, getRoutePoints, getMyCars } from '../lib/api';
import { showToast } from '../lib/toast';
import { Appear } from '../components/Appear';
import type { SelectOption } from '../components/ui/Select';
import type { GetMyTemplateResponse, RoutePoint, Car } from '../types/api';

interface DriverPublishScreenProps {
  onPublish: (tripId: number) => void;
  title?: string;
  timeOptions?: string[];
  defaultTime?: string;
  routeLabel?: string;
  defaultPickup?: string;
  reverse?: boolean;
  /** Открыть экран «Добавить машину» (из выпадающего списка машин). */
  onAddCar?: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

// Единый фиксированный стиль полей маршрута: одна строка, одинаковая высота, радиус 18px.
const routeFieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: '48px',
  borderRadius: '18px',
  background: 'var(--field)',
  border: '1px solid var(--field-border)',
  boxShadow: 'var(--field-shadow)',
  padding: '12px 16px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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
  onAddCar,
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
  const [isReversed, setIsReversed] = useState<boolean>(reverse);
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  const [showCarDropdown, setShowCarDropdown] = useState<boolean>(false);
  const carDropdownRef = useRef<HTMLDivElement>(null);
  const timeLabelId = useId();
  const seatsLabelId = useId();
  const customTimeLabelId = useId();
  const dateLabelId = useId();

  // Загрузить шаблон, route points и машины при монтировании
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [tmpl, pointsResp, carsResp] = await Promise.all([
          getMyTemplate(),
          getRoutePoints(),
          getMyCars(),
        ]);
        setTemplate(tmpl);
        setRoutePoints(pointsResp.points);
        setSeats(tmpl.seats_total);
        setCars(carsResp.cars);
        // Выбрать первую машину по умолчанию, если есть
        if (carsResp.cars.length > 0) {
          setSelectedCarId(carsResp.cars[0].id);
        }
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

  // Закрыть выпадающий список машин при клике вне его
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (carDropdownRef.current && !carDropdownRef.current.contains(e.target as Node)) {
        setShowCarDropdown(false);
      }
    };
    if (showCarDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCarDropdown]);

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
      const response = await publishTrip({
        templateId: template.id,
        date,
        departureTime: formatTimeToHHMM(actualTime),
        reverse: isReversed,
        carId: selectedCarId ?? undefined,
      });
      onPublish(response.trip.tripId);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Ошибка публикации поездки';
      showToast(msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleSwapDirection = () => {
    hapticSelection();
    setIsReversed((prev) => !prev);
  };

  const handleCarSelect = (carId: number) => {
    hapticSelection();
    setSelectedCarId(carId);
    setShowCarDropdown(false);
  };

  const handleAddCarClick = () => {
    hapticSelection();
    setShowCarDropdown(false);
    if (onAddCar) {
      onAddCar();
    }
  };

  // Определяем точки маршрута в зависимости от направления (swap-кнопка)
  const destPointId = template ? (isReversed ? template.start_point_id : template.end_point_id) : null;
  const destPoint = routePoints.find((p) => p.id === destPointId) ?? null;
  const destLabel = destPoint ? destPoint.title : isReversed ? 'Брагино' : 'Центр';

  // Единственное поле выбора — улица отправления (без подписи района).
  const pickupOptions = defaultPickup === 'volkova' ? EVENING_PICKUP_OPTIONS : DEFAULT_PICKUP_OPTIONS;

  const selectedCar = cars.find((c) => c.id === selectedCarId);

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
              {/* Маршрут из шаблона — карточка с swap-кнопкой */}
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
                <div style={sectionLabelStyle}>{routeLabel}</div>
                <div style={{ display: 'flex', gap: '12px', margin: '4px 0', paddingRight: '48px' }}>
                  <RouteConnector />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {/* Первая точка — inline Select с белым фоном r18 (только улица) */}
                    <div
                      style={{
                        ...routeFieldStyle,
                        order: isReversed ? 1 : 0,
                      }}
                    >
                      <Select
                        options={pickupOptions}
                        value={pickup}
                        onChange={(val) => {
                          hapticSelection();
                          setPickup(val);
                        }}
                        aria-label="Откуда забрать"
                      />
                    </div>

                    {/* Вторая точка — read-only с пунктирной рамкой r18 и замком */}
                    <div
                      style={{
                        ...routeFieldStyle,
                        border: '1px dashed var(--border)',
                        background: 'color-mix(in srgb, var(--secondary) 42%, transparent)',
                        color: 'var(--muted-foreground)',
                        fontSize: '15px',
                        fontWeight: 600,
                        gap: '10px',
                        order: isReversed ? 0 : 1,
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
                      <span
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {destLabel}
                      </span>
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
                    width: '40px',
                    height: '40px',
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
            borderRadius: '18px',
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

      {/* Секция выбора машины */}
      <div style={{ position: 'relative' }} ref={carDropdownRef}>
        <div style={sectionLabelStyle}>Машина</div>
        <button
          type="button"
          onClick={() => {
            hapticSelection();
            setShowCarDropdown(!showCarDropdown);
          }}
          className="focus-ring pressable"
          style={{
            width: '100%',
            minHeight: '50px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            borderRadius: '18px',
            background: 'var(--field)',
            border: '1px solid var(--field-border)',
            boxShadow: 'var(--field-shadow)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {/* Иконка авто */}
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'var(--gradient-brand)',
              color: 'var(--brand-foreground)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon id="i-car" style={{ width: '18px', height: '18px' }} />
          </div>

          {/* Текст: модель · номер или "Выбрать машину" */}
          <div
            style={{
              flex: 1,
              textAlign: 'left',
              fontSize: '15px',
              fontWeight: 600,
              color: selectedCar ? 'var(--foreground)' : 'var(--muted-foreground)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {selectedCar
              ? `${selectedCar.model}${selectedCar.plate ? ` · ${selectedCar.plate}` : ''}`
              : 'Выбрать машину'}
          </div>

          {/* Шеврон */}
          <span
            style={{
              transform: showCarDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              flexShrink: 0,
            }}
          >
            ▼
          </span>
        </button>

        {/* Выпадающий список */}
        {showCarDropdown && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: 'var(--elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              zIndex: 10,
            }}
          >
            {/* Список машин */}
            {cars.map((car) => (
              <button
                key={car.id}
                type="button"
                onClick={() => handleCarSelect(car.id)}
                className="focus-ring pressable"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-sans)',
                  textAlign: 'left',
                }}
              >
                <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {car.model}
                  {car.plate && ` · ${car.plate}`}
                </div>
                {selectedCarId === car.id && (
                  <span style={{ fontSize: '18px', color: 'var(--brand)' }}>✓</span>
                )}
              </button>
            ))}

            {/* Разделитель перед "Добавить машину" */}
            {cars.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
            )}

            {/* Кнопка "Добавить машину" */}
            <button
              type="button"
              onClick={handleAddCarClick}
              className="focus-ring pressable"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 14px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--brand-dark)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{ fontSize: '20px' }}>+</span>
              <span>Добавить машину</span>
            </button>
          </div>
        )}
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
