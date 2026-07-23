import { useState } from 'react';
import WhenSheet, { ANY_TIME } from '../components/WhenSheet';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icon } from '../components/Icons';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import { Skeleton } from '../components/ui/Skeleton';
import ErrorTripsState from '../components/ErrorTripsState';
import SectionHeader from '../components/SectionHeader';
import WomenRideEmptyState from '../components/WomenRideEmptyState';
import MainDashboardHeader from '../components/MainDashboardHeader';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT } from '../lib/layout';
import type { Trip } from '../types/navigation';
import type { UserRole } from '../lib/role';
import { useProfile } from '../contexts/ProfileContext';
import { useScreenData } from '../hooks/useScreenData';
import { fetchSafety, DEFAULT_SAFETY } from '../lib/screenFetchers';
import type { GetMySafetyResponse } from '../types/api';
import { localDateStr } from '../lib/dateLocal';
import { hapticSelection, hapticImpact } from '../lib/haptics';

// Причина недоступности мужских/unknown поездок в режиме женских поездок (issue #448).
const WOMEN_DISABLED_REASON = 'Водитель — мужчина. Недоступно в режиме женских поездок.';

type Direction = 'morning' | 'evening';

// ── Хелперы сценарных подписей (issue #463) ────────────────────────────────

/**
 * Русская плюрализация по числу. forms = [one, few, many]:
 *   1 «водитель», 2–4 «водителя», 0/5+ «водителей».
 * Числа 11–14 (по двум последним цифрам) всегда many.
 */
function pluralRu(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = n % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

const DRIVER_WORDS: [string, string, string] = ['водитель', 'водителя', 'водителей'];
const SEAT_WORDS: [string, string, string] = ['место', 'места', 'мест'];

/** Приветствие по локальному часу: 5–10 утро, 11–16 день, 17–22 вечер, иначе ночь. */
function greetingByHour(hour: number): string {
  if (hour >= 5 && hour <= 10) return 'Доброе утро';
  if (hour >= 11 && hour <= 16) return 'Добрый день';
  if (hour >= 17 && hour <= 22) return 'Добрый вечер';
  return 'Доброй ночи';
}

/** Инициалы из имени: первые буквы первых двух слов, в верхнем регистре. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const a = parts[0][0] ?? '';
  const b = parts.length > 1 ? (parts[1][0] ?? '') : '';
  return (a + b).toUpperCase();
}

/** Минут до времени HH:MM от «сейчас» (в рамках сегодняшнего дня). */
function minutesUntil(time: string, now: Date = new Date()): number {
  const [h, m] = time.split(':').map(Number);
  const dep = new Date(now);
  dep.setHours(h, m, 0, 0);
  return Math.round((dep.getTime() - now.getTime()) / 60000);
}

/** Минуты от полуночи для времени HH:MM (сравнение слотов, issue #465). */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Названия месяцев в родительном падеже — для чипа выбранной даты «21 июля».
const GEN_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «YYYY-MM-DD» → «21 июля». */
function formatDayMonth(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${GEN_MONTHS[(m - 1) % 12]}`;
}

// ── Мелкие презентационные компоненты ──────────────────────────────────────

const GreetingHeader: React.FC<{ greeting: string; name: string; onAvatarClick?: () => void }> = ({ greeting, name, onAvatarClick }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '2px 2px 0' }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '15px', color: 'var(--muted-foreground)' }}>{greeting}{name ? ',' : ''}</div>
      {name && (
        <div
          style={{
            fontSize: '24px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
      )}
    </div>
    {name && (
      <button
        type="button"
        aria-label="Профиль"
        onClick={() => {
          hapticImpact('light');
          onAvatarClick?.();
        }}
        className="focus-ring pressable"
        style={{
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          padding: 0,
          minWidth: '44px',
          minHeight: '44px',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          borderRadius: '16px',
        }}
      >
        <Avatar label={getInitials(name)} hideRating size={44} />
      </button>
    )}
  </div>
);

const Segmented: React.FC<{ direction: Direction; onToggleDirection?: () => void }> = ({ direction, onToggleDirection }) => {
  const select = (target: Direction) => {
    if (target === direction) return;
    hapticSelection();
    onToggleDirection?.();
  };
  const options: Array<{ key: Direction; label: string; icon: string }> = [
    { key: 'morning', label: 'Утро', icon: 'i-sun' },
    { key: 'evening', label: 'Вечер', icon: 'i-moon' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Направление коридора"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', background: 'var(--secondary)', borderRadius: '16px', padding: '4px' }}
    >
      {options.map(({ key, label, icon }) => {
        const active = direction === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(key)}
            className="focus-ring"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              minHeight: '44px',
              borderRadius: '13px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              fontSize: '16px',
              background: active ? 'var(--elevated)' : 'transparent',
              color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow: active ? 'var(--shadow-card)' : 'none',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <Icon id={icon} style={{ width: '18px', height: '18px' }} />
            {label}
          </button>
        );
      })}
    </div>
  );
};

const RouteDayLine: React.FC<{
  from: string;
  to: string;
  dayLabel: string;
  onOpenWhen?: () => void;
}> = ({ from, to, dayLabel, onOpenWhen }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '0 2px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, fontSize: '14px', color: 'var(--foreground)', overflow: 'hidden' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', border: '2px solid var(--muted-foreground)', flexShrink: 0 }} />
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{from}</span>
      <Icon id="i-arrow-r" style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)', flexShrink: 0 }} />
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--brand)', flexShrink: 0 }} />
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{to}</span>
    </div>
    {onOpenWhen && (
      <button
        type="button"
        onClick={onOpenWhen}
        aria-haspopup="dialog"
        className="focus-ring pressable"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          minHeight: '32px',
          padding: '0 10px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--elevated)',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          fontSize: '13.5px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {dayLabel}
        <Icon id="i-chev-d" style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)' }} />
      </button>
    )}
  </div>
);

// Билет-карточка отправления (редизайн, Вариант B): слева «корешок» с точным
// временем, справа — маршрут (с переносом, без обрезки), водитель и цена/места.
// Устойчиво к крупному шрифту: минимум nowrap, карточка тянется по высоте.
const TimelineRow: React.FC<{
  trip: Trip;
  nearest: boolean;
  isFirst: boolean;
  isLast: boolean;
  isToday: boolean;
  dimmed: boolean;
  disabledReason?: string;
  onTripClick: (trip: Trip) => void;
  onOpenProfile?: (userId: number) => void;
}> = ({ trip, nearest, isToday, dimmed, disabledReason, onTripClick, onOpenProfile }) => {
  const rating = trip.driver.rating.toFixed(1).replace('.', ',');
  const from = trip.route?.from || `Брагино, ${trip.address}`.split(',')[0];
  const to = trip.route?.to || 'Центр';
  const duration = trip.route?.duration || '22 мин';
  const mins = minutesUntil(trip.time);
  const durationLabel = nearest && isToday && mins >= 0 && mins < 60 ? `через ${mins} мин` : `в пути ${duration}`;
  const seatsLabel = trip.seats === 0 ? 'мест нет' : `${trip.seats} ${pluralRu(trip.seats, SEAT_WORDS)}`;
  const isOwn = trip.isOwn;

  const handleAvatar = (e: React.MouseEvent) => {
    if (trip.driver.id && onOpenProfile) {
      e.stopPropagation();
      onOpenProfile(trip.driver.id);
    }
  };

  const stubBg = isOwn ? 'var(--muted)' : nearest ? 'var(--gradient-brand)' : 'var(--accent)';
  const stubColor = isOwn ? 'var(--muted-foreground)' : 'var(--brand-foreground)';

  return (
    <div style={dimmed ? { filter: 'grayscale(60%)', opacity: 0.6 } : undefined}>
      <Card
        role="button"
        tabIndex={0}
        aria-label={`${trip.driver.name}, ${trip.time}, ${from} → ${to}, ${trip.price} ₽, ${seatsLabel}${disabledReason ? `. ${disabledReason}` : ''}`}
        onClick={() => onTripClick(trip)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTripClick(trip);
          }
        }}
        style={{
          padding: 0,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          alignItems: 'stretch',
          cursor: 'pointer',
          border: isOwn ? '1px solid var(--border)' : nearest ? '1.5px solid var(--brand)' : '1px solid var(--border)',
        }}
      >
        {/* Корешок билета: точное время по центру, пунктирный «отрыв» справа */}
        <div
          style={{
            background: stubBg,
            color: stubColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 14px',
            minWidth: '58px',
            borderRight: '2px dashed color-mix(in srgb, var(--brand-foreground) 22%, transparent)',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '19px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {trip.time}
          </span>
        </div>

        {/* Тело: маршрут (перенос по словам), водитель, цена/места */}
        <div style={{ minWidth: 0, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'break-word', wordBreak: 'normal' }}>
            <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>{from}</span>
            {' '}
            <span style={{ color: 'var(--brand-dark)', fontWeight: 800 }}>→</span>
            {' '}
            <span>{to}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
            <div
              onClick={handleAvatar}
              aria-hidden
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '8px',
                background: 'var(--muted)',
                color: 'var(--foreground)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: '11px',
                flexShrink: 0,
                cursor: trip.driver.id && onOpenProfile ? 'pointer' : 'default',
              }}
            >
              {getInitials(trip.driver.name)}
            </div>
            <span style={{ fontSize: '14px', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.driver.name}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--muted-foreground)', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
              <Icon id="i-star" fill style={{ width: '13px', height: '13px', color: 'var(--star)' }} />
              {rating}
            </span>
            {trip.booked && (
              <span style={{ flexShrink: 0, fontSize: '11px', fontWeight: 800, padding: '1px 7px', borderRadius: '999px', background: 'var(--brand)', color: 'var(--brand-foreground)' }}>
                ты едешь
              </span>
            )}
          </div>

          {disabledReason && (
            <div style={{ fontSize: '12.5px', color: 'var(--muted-foreground)' }}>{disabledReason}</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>{trip.price} ₽</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', fontWeight: 700, color: 'var(--brand-dark)', background: 'var(--accent)', borderRadius: '8px', padding: '2px 8px' }}>
              <Icon id="i-seat" style={{ width: '13px', height: '13px' }} />
              {seatsLabel}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '12.5px', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{durationLabel}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

const TimelineTail: React.FC<{ period: string; onLeaveRequest?: () => void }> = ({ period, onLeaveRequest }) => (
  <div
    style={{
      border: '1px dashed var(--border)',
      borderRadius: 'var(--radius-xl)',
      padding: '13px 15px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px 14px',
      flexWrap: 'wrap',
    }}
  >
    <span style={{ fontSize: '13.5px', color: 'var(--muted-foreground)' }}>Позже {period} никто не едет</span>
    {onLeaveRequest && (
      <button
        type="button"
        onClick={onLeaveRequest}
        className="focus-ring pressable"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--brand-dark)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 800,
          fontSize: '13.5px',
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          padding: 0,
        }}
      >
        Подписаться на маршрут →
      </button>
    )}
  </div>
);

const Timeline: React.FC<{
  trips: Trip[];
  isToday: boolean;
  highlightFirst: boolean;
  showTail: boolean;
  period: string;
  dimmed?: boolean;
  disabledReason?: string;
  preferredTime?: string;
  onTripClick: (trip: Trip) => void;
  onOpenProfile?: (userId: number) => void;
  onLeaveRequest?: () => void;
}> = ({ trips, isToday, highlightFirst, showTail, period, dimmed = false, disabledReason, preferredTime, onTripClick, onOpenProfile, onLeaveRequest }) => {
  // Якорь подсветки «ближайшей»: при заданном preferredTime — первый слот ≥ него,
  // иначе первая поездка (список приходит с сервера отсортированным по времени, #465).
  const anchorIndex =
    preferredTime && preferredTime !== ANY_TIME
      ? Math.max(0, trips.findIndex((t) => toMinutes(t.time) >= toMinutes(preferredTime)))
      : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {trips.map((trip, index) => (
        <TimelineRow
          key={trip.id}
          trip={trip}
          nearest={highlightFirst && index === anchorIndex}
          isFirst={index === 0}
          isLast={!showTail && index === trips.length - 1}
          isToday={isToday}
          dimmed={dimmed}
          disabledReason={disabledReason}
          onTripClick={onTripClick}
          onOpenProfile={onOpenProfile}
        />
      ))}
      {showTail && <TimelineTail period={period} onLeaveRequest={onLeaveRequest} />}
    </div>
  );
};

const TimelineSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          overflow: 'hidden',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
          background: 'var(--elevated)',
        }}
      >
        <div style={{ background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', minWidth: '58px' }}>
          <Skeleton w={34} h={16} r={6} />
        </div>
        <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton w="80%" h={15} r={7} />
          <Skeleton w="50%" h={12} r={6} />
          <Skeleton w="40%" h={13} r={6} />
        </div>
      </div>
    ))}
  </div>
);

const DriverBanner: React.FC<{ warmDest: string; onPublish: () => void; onOpenDemand?: () => void }> = ({
  warmDest,
  onPublish,
  onOpenDemand,
}) => {
  const showsDemand = onOpenDemand !== undefined;
  return (
    <button
      type="button"
      onClick={() => {
        hapticImpact('light');
        (onOpenDemand ?? onPublish)();
      }}
      className="focus-ring pressable"
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-xl)',
        border: 'none',
        background: 'var(--gradient-brand)',
        color: 'var(--brand-foreground)',
        boxShadow: 'var(--shadow-hero)',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span style={{ width: '38px', height: '38px', borderRadius: '12px', background: 'rgba(0, 0, 0, .08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon id="i-wheel" style={{ width: '20px', height: '20px' }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: '16px' }}>
          {showsDemand ? 'Вас ждут попутчики' : 'Сам за рулём?'}
        </span>
        <span style={{ display: 'block', fontSize: '13.5px', opacity: 0.72 }}>
          {showsDemand ? `Посмотрите, кто ищет поездку ${warmDest}` : `Возьми попутчиков ${warmDest}`}
        </span>
      </span>
      <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#18170f', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon id="i-arrow-r" style={{ width: '18px', height: '18px' }} />
      </span>
    </button>
  );
};

const ScenarioEmpty: React.FC<{
  title: string;
  canPublish: boolean;
  onLeaveRequest?: () => void;
  onPublish: () => void;
}> = ({ title, canPublish, onLeaveRequest, onPublish }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 20px 20px', gap: '16px' }}>
    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', display: 'grid', placeItems: 'center', color: 'var(--brand-dark)' }}>
      <Icon id="i-clock" style={{ width: '30px', height: '30px' }} />
    </div>
    <div>
      <div style={{ fontWeight: 800, fontSize: '19px', letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ fontSize: '15px', color: 'var(--muted-foreground)', marginTop: '6px', lineHeight: 1.5, maxWidth: '260px' }}>
        Подпишитесь на маршрут — пришлём уведомление, как только кто-то поедет.
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', width: '100%', maxWidth: '320px' }}>
      {onLeaveRequest && (
        <Button variant="primary" onClick={onLeaveRequest}>
          Подписаться на маршрут
        </Button>
      )}
      {canPublish && (
        <Button variant="secondary" onClick={onPublish}>
          Я сам за рулём — возьму попутчиков
        </Button>
      )}
    </div>
  </div>
);

// ── Экран ──────────────────────────────────────────────────────────────────

interface MainScreenProps {
  trips: Trip[];
  /** Направление коридора: 'morning' (Брагино→Центр) | 'evening' (Центр→Брагино). */
  direction?: Direction;
  onTripClick: (trip: Trip) => void;
  onPublish: () => void;
  onLeaveRequest?: () => void;
  subtitle?: string;
  title?: string;
  /** Больше не используется таймлайн-презентацией; сохранён для совместимости с реестром. */
  heroKicker?: string;
  loading?: boolean;
  error?: Error;
  onRetry?: () => void;
  onToggleDirection?: () => void;
  userRole?: UserRole;
  onOpenProfile?: (userId: number) => void;
  onOpenProfileTab?: () => void;
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  onOpenDemand?: () => void;
}

const MainScreen: React.FC<MainScreenProps> = ({
  trips,
  direction = 'morning',
  onTripClick,
  onPublish,
  onLeaveRequest,
  subtitle,
  title = 'Брагино → Центр',
  loading = false,
  error,
  onRetry,
  onToggleDirection,
  userRole = 'passenger',
  onOpenProfile,
  selectedDate,
  onSelectDate,
  onOpenProfileTab,
  onOpenDemand,
}) => {
  const prefersReduced = useReducedMotion();
  const { profile } = useProfile();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const [whenOpen, setWhenOpen] = useState(false);
  const [preferredTime, setPreferredTime] = useState(ANY_TIME);

  // Кнопку публикации показываем водителю. Источник истины — серверный статус ВУ,
  // а не только localStorage-роль (в Telegram WebView роль может теряться).
  const canPublish = userRole === 'driver' || profile?.license_status === 'verified';

  const hasTrips = trips.length > 0;

  // Режим женских поездок (issue #448): читаем women_only тем же кэш-ключом, что и SafetyScreen.
  const { data: safety } = useScreenData<GetMySafetyResponse>('safety', fetchSafety);
  const womenOnly = safety?.womenOnly ?? DEFAULT_SAFETY.womenOnly;

  const femaleTrips = womenOnly ? trips.filter((t) => t.driver.sex === 'female') : trips;
  const restTrips = womenOnly ? trips.filter((t) => t.driver.sex !== 'female') : [];

  // Сценарные значения
  const today = localDateStr();
  const tomorrow = localDateStr(new Date(Date.now() + 86_400_000));
  const isToday = !selectedDate || selectedDate === today;
  const isTomorrow = !isToday && selectedDate === tomorrow;
  // Ярлык выбранного дня: Сегодня/Завтра словами, произвольная дата — «25 июля» (issue #465).
  const dayLabelCap = isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : formatDayMonth(selectedDate ?? today);
  const dayLabelLower = isToday ? 'сегодня' : isTomorrow ? 'завтра' : dayLabelCap;
  const warmDest = direction === 'morning' ? 'в центр' : 'домой';
  const period = direction === 'morning' ? 'утром' : 'вечером';
  const routeFrom = direction === 'morning' ? 'Брагино' : 'Центр';
  const routeTo = direction === 'morning' ? 'Центр' : 'Брагино';
  const greeting = greetingByHour(new Date().getHours());
  const userName = profile?.name?.trim() || '';

  const primaryTrips = womenOnly ? femaleTrips : trips;
  const primaryCount = primaryTrips.length;
  const sectionSubtitle = `${primaryCount} ${pluralRu(primaryCount, DRIVER_WORDS)} ${primaryCount === 1 ? 'едет' : 'едут'} ${warmDest} ${dayLabelLower} ${period}`;
  const emptyTitle = isToday ? `Пока никто не едет ${warmDest} ${period}` : `${dayLabelCap} ${period} поездок пока нет`;

  const TIME_SLOTS = direction === 'morning'
    ? ['7:30', '7:40', '7:55', '8:10']
    : ['17:30', '17:40', '18:00', '18:30'];

  // Подпись чипа даты: Сегодня/Завтра/«21 июля» (+ «, 7:40» если время выбрано).
  const dateBase = dayLabelCap;
  const dateChipLabel = preferredTime !== ANY_TIME ? `${dateBase}, ${preferredTime}` : dateBase;

  const openWhen = () => {
    hapticSelection();
    setWhenOpen(true);
  };
  const applyWhen = (date: string, time: string) => {
    onSelectDate?.(date);
    setPreferredTime(time);
  };

  const D = prefersReduced ? 0 : 0.42;
  const DX = prefersReduced ? 0 : 0.3;
  const EASE = [0.22, 1, 0.36, 1] as const;
  const fadeOpacity = prefersReduced ? 1 : 0;

  const sectionTitle = (
    <div style={{ padding: '2px 2px 0' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.01em' }}>Ближайшие отправления</div>
      <div style={{ fontSize: '14.5px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{sectionSubtitle}</div>
    </div>
  );

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: `6px 16px ${FLOATING_NAV_SCROLL_CLEARANCE}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {isDesktop ? (
        <MainDashboardHeader
          title={title}
          subtitle={subtitle}
          countLabel={hasTrips ? sectionSubtitle : 'Пока никто не едет'}
          onToggleDirection={onToggleDirection}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      ) : (
        <>
          <GreetingHeader greeting={greeting} name={userName} onAvatarClick={onOpenProfileTab} />
          <Segmented direction={direction} onToggleDirection={onToggleDirection} />
          <RouteDayLine
            from={routeFrom}
            to={routeTo}
            dayLabel={dateChipLabel}
            onOpenWhen={onSelectDate ? openWhen : undefined}
          />
        </>
      )}

      <div style={{ position: 'relative' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {loading ? (
            <motion.div
              key="loading-skeleton"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
              transition={{ duration: DX, ease: EASE }}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {sectionTitle}
              <TimelineSkeleton />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error-state"
              initial={{ opacity: fadeOpacity }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
              transition={{ duration: D, ease: EASE }}
            >
              <ErrorTripsState error={error} onRetry={onRetry ?? (() => {})} />
            </motion.div>
          ) : hasTrips ? (
            <motion.div
              key="trips-content"
              initial={{ opacity: fadeOpacity }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
              transition={{ duration: D, ease: EASE }}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {womenOnly ? (
                <>
                  <div>
                    <SectionHeader title="Женские поездки" count={femaleTrips.length} variant="female" first />
                    {femaleTrips.length > 0 ? (
                      <Timeline
                        trips={femaleTrips}
                        isToday={isToday}
                        highlightFirst
                        showTail
                        period={period}
                        preferredTime={preferredTime}
                        onTripClick={onTripClick}
                        onOpenProfile={onOpenProfile}
                        onLeaveRequest={onLeaveRequest}
                      />
                    ) : (
                      <WomenRideEmptyState onToggleDirection={onToggleDirection} />
                    )}
                  </div>
                  {restTrips.length > 0 && (
                    <div>
                      <SectionHeader title="Остальные — с мужчинами" count={restTrips.length} variant="muted" />
                      <Timeline
                        trips={restTrips}
                        isToday={isToday}
                        highlightFirst={false}
                        showTail={false}
                        period={period}
                        dimmed
                        disabledReason={WOMEN_DISABLED_REASON}
                        onTripClick={onTripClick}
                        onOpenProfile={onOpenProfile}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {sectionTitle}
                  <Timeline
                    trips={trips}
                    isToday={isToday}
                    highlightFirst
                    showTail
                    period={period}
                    preferredTime={preferredTime}
                    onTripClick={onTripClick}
                    onOpenProfile={onOpenProfile}
                    onLeaveRequest={onLeaveRequest}
                  />
                </>
              )}

              {canPublish && <DriverBanner warmDest={warmDest} onPublish={onPublish} onOpenDemand={onOpenDemand} />}
            </motion.div>
          ) : (
            <motion.div
              key="empty-state"
              initial={{ opacity: fadeOpacity }}
              animate={{ opacity: 1 }}
              exit={{ opacity: fadeOpacity }}
              transition={{ duration: D, ease: EASE }}
            >
              <ScenarioEmpty
                title={emptyTitle}
                canPublish={canPublish}
                onLeaveRequest={onLeaveRequest}
                onPublish={onPublish}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!isDesktop && onSelectDate && (
        <WhenSheet
          open={whenOpen}
          selectedDate={selectedDate ?? today}
          preferredTime={preferredTime}
          today={today}
          tomorrow={tomorrow}
          timeSlots={TIME_SLOTS}
          onApply={applyWhen}
          onClose={() => setWhenOpen(false)}
        />
      )}
    </div>
  );
};

export default MainScreen;
