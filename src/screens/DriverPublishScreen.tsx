import { useId, useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Calendar from '../components/ui/Calendar';
import { RouteDot, RouteMidConnector } from '../components/ui/RouteConnector';
import { Skeleton } from '../components/ui/Skeleton';
import { LoadErrorState } from '../components/ui/StateView';
import { Icon } from '../components/Icons';
import Header from '../components/Header';
import PhoneField from '../components/PhoneField';
import { hapticSelection } from '../lib/haptics';
import { getMyTemplate, publishTrip, ApiException, getRoutePoints, getMyCars } from '../lib/api';
import { showToast } from '../lib/toast';
import { localDateStr, validateDeparture, DEPARTURE_ERROR_MESSAGES } from '../lib/dateLocal';
import { Appear } from '../components/Appear';
import type { SelectOption } from '../components/ui/Select';
import type { GetMyTemplateResponse, RoutePoint, Car } from '../types/api';
import type { PublishedTripSummary } from '../types/navigation';

interface DriverPublishScreenProps {
  onPublish: (summary: PublishedTripSummary) => void;
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

const DEFAULT_TIME_OPTIONS = ['7:30', '7:40', '7:55', '8:10', 'другое'];
const MIN_SEATS = 1;
const MAX_SEATS = 4;

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
  reverse = false,
  onAddCar,
}) => {
  const [time, setTime] = useState<string>(defaultTime);
  const [customTime, setCustomTime] = useState<string>('');
  const [seats, setSeats] = useState<number>(3);
  const [fromPointId, setFromPointId] = useState<string>('');
  const [toPointId, setToPointId] = useState<string>('');
  const [date, setDate] = useState<string>(localDateStr());
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [template, setTemplate] = useState<GetMyTemplateResponse | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // needsTelegram (issue #307/#239): 401 от /api/me/* — нет валидной Telegram-сессии,
  // это НЕ сетевая проблема. Различаем по образцу ProfileContext.needsTelegram,
  // чтобы не показывать вводящее в заблуждение «Проверь соединение».
  const [needsTelegram, setNeedsTelegram] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  // Телефон собирается «по требованию» (issue #267): публикация недоступна,
  // пока номер не задан в профиле (phoneReady).
  const [phoneReady, setPhoneReady] = useState<boolean>(false);
  const [showCarDropdown, setShowCarDropdown] = useState<boolean>(false);
  const carDropdownRef = useRef<HTMLDivElement>(null);
  const timeLabelId = useId();
  const seatsLabelId = useId();
  const customTimeLabelId = useId();
  const dateLabelId = useId();

  // Загрузить шаблон, route points и машины (вынесено для «Повторить» из состояния ошибки)
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setNeedsTelegram(false);
      const [tmpl, pointsResp, carsResp] = await Promise.all([
        getMyTemplate(),
        getRoutePoints(),
        getMyCars(),
      ]);
      setTemplate(tmpl);
      setRoutePoints(pointsResp.points);
      setSeats(tmpl.seats_total);
      // Инициализация точек маршрута из шаблона с учётом начального направления (reverse)
      setFromPointId(String(reverse ? tmpl.end_point_id : tmpl.start_point_id));
      setToPointId(String(reverse ? tmpl.start_point_id : tmpl.end_point_id));
      setCars(carsResp.cars);
      // Выбрать первую машину по умолчанию, если есть
      if (carsResp.cars.length > 0) {
        setSelectedCarId(carsResp.cars[0].id);
      }
    } catch (err) {
      if (err instanceof ApiException && err.status === 401) {
        // Нет валидной Telegram-сессии — не сетевая ошибка (issue #307/#239,
        // тот же паттерн, что и ProfileContext.needsTelegram).
        setNeedsTelegram(true);
      } else {
        const msg = err instanceof ApiException ? err.message : 'Ошибка загрузки данных';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [reverse]);

  useEffect(() => {
    void loadData();
  }, [loadData, reverse]);

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

    // Точки отправления и назначения должны отличаться
    if (fromPointId === toPointId) {
      showToast('Точки отправления и назначения должны отличаться');
      return;
    }

    // Телефон обязателен перед публикацией (issue #267).
    if (!phoneReady) {
      showToast('Сначала укажите телефон для связи');
      return;
    }

    // Нельзя публиковать поездку в прошлом или менее чем за 10 минут до выезда (issue #330).
    const departureIssue = validateDeparture(date, formatTimeToHHMM(actualTime));
    if (departureIssue !== null) {
      showToast(DEPARTURE_ERROR_MESSAGES[departureIssue]);
      return;
    }

    // Направление коридора для API: reverse=true, если старт совпал с конечной точкой шаблона
    const reverseForApi = Number(fromPointId) === template.end_point_id;

    try {
      setPublishing(true);
      const response = await publishTrip({
        templateId: template.id,
        date,
        departureTime: formatTimeToHHMM(actualTime),
        reverse: reverseForApi,
        carId: selectedCarId ?? undefined,
      });
      // Названия точек для экрана подтверждения берём из выбранного маршрута.
      const startTitle = routePoints.find((p) => p.id === Number(fromPointId))?.title ?? '';
      const endTitle = routePoints.find((p) => p.id === Number(toPointId))?.title ?? '';
      onPublish({
        tripId: response.trip.tripId,
        startTitle,
        endTitle,
        tripDate: response.trip.tripDate,
        departureTime: response.trip.departureTime,
        seatsTotal: response.trip.seatsTotal,
        priceRub: response.trip.priceRub,
      });
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Ошибка публикации поездки';
      showToast(msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleSwapDirection = () => {
    hapticSelection();
    // Реально меняем точки местами (обе редактируемые) — без CSS order и блокировки
    setFromPointId(toPointId);
    setToPointId(fromPointId);
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

  // Опции маршрута — концы коридора из шаблона (стартовая и конечная точки).
  // Обе точки редактируемые; свап и выбор задают направление (reverse вычисляется при публикации).
  const corridorOptions: SelectOption[] = template
    ? routePoints
        .filter((p) => p.id === template.start_point_id || p.id === template.end_point_id)
        .map((p) => ({ value: String(p.id), label: p.title }))
    : [];

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
          </Appear>
        ) : needsTelegram ? (
          <Appear key="needs-telegram" animateKey="needs-telegram">
            <LoadErrorState
              title="Открой в Telegram"
              subtitle="Открой в Telegram, чтобы создать поездку."
              onRetry={() => { void loadData(); }}
            />
          </Appear>
        ) : error ? (
          <Appear key="error" animateKey="error">
            <LoadErrorState onRetry={() => { void loadData(); }} />
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0', paddingRight: '48px' }}>
                  {/* Точка отправления — редактируемый Select */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '48px' }}>
                    <RouteDot filled />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Select
                        variant="field"
                        options={corridorOptions}
                        value={fromPointId}
                        onChange={(val) => {
                          hapticSelection();
                          setFromPointId(val);
                        }}
                        placeholder="Откуда"
                        aria-label="Точка отправления"
                      />
                    </div>
                  </div>

                  <RouteMidConnector />

                  {/* Точка назначения — редактируемый Select (разблокирована) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '48px' }}>
                    <RouteDot />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Select
                        variant="field"
                        options={corridorOptions}
                        value={toPointId}
                        onChange={(val) => {
                          hapticSelection();
                          setToPointId(val);
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
              display: 'inline-flex',
              transform: showCalendar ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
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
              display: 'inline-flex',
              transform: showCarDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
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

      {/* Телефон · сбор «по требованию» (issue #267) — обязателен перед публикацией */}
      <PhoneField
        label="Телефон для связи"
        hint="Нужен, чтобы пассажиры могли связаться с тобой по этой поездке."
        onReadyChange={setPhoneReady}
      />

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
                  disabled={publishing || !phoneReady}
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
