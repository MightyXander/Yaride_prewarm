import { useState, useEffect, useCallback, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { RouteDot, RouteMidConnector } from '../components/ui/RouteConnector';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import PhoneLink from '../components/PhoneLink';
import { showToast } from '../lib/toast';
import { hapticNotify } from '../lib/haptics';
import { shareToTelegram, buildTripDeepLink } from '../lib/share';
import { Appear } from '../components/Appear';
import BookingCard from '../components/BookingCard';
import BookingSpotlight from '../components/BookingSpotlight';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { ResponsiveTwoColumn } from '../components/ui/ResponsiveTwoColumn';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT } from '../lib/layout';
import {
  getTripParticipants,
  getTripBookings,
  cancelBookingByDriver,
  confirmBookingByDriver,
  ApiException,
} from '../lib/api';
import type { TripParticipant, BookingDetail } from '../types/api';
import type { Trip } from '../types/navigation';

interface TripDetailsScreenProps {
  trip: Trip;
  onBook: () => void;
  onOpenProfile?: (userId: number) => void;
  /** Отменить всю поездку (доступно водителю своей поездки). */
  onCancelTrip?: () => void;
  /** Пассажир, чью бронь подсветить блюр-сценкой при заходе из уведомления (issue #339). */
  bookingFocusUserId?: number | null;
  /** Сбросить фокус после того, как сценка сыграна/пропущена/снята тапом. */
  onClearBookingFocus?: () => void;
}

// Бэйдж госномера — общий контейнер для реального номера и цензуры.
const plateBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '24px',
  padding: '0 9px',
  gap: '3px',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'color-mix(in srgb, var(--foreground) 6%, var(--card))',
  fontWeight: 800,
  fontSize: '13px',
  letterSpacing: '0.03em',
  color: 'var(--foreground)',
  fontVariantNumeric: 'tabular-nums',
  verticalAlign: 'middle',
};

// Строка «label — значение» в карточке маршрута: фиксированная колонка подписи
// выравнивает все значения (номер, телефон, бензин) в один столбец.
const infoLabelStyle: React.CSSProperties = {
  minWidth: '76px',
  flexShrink: 0,
  color: 'var(--muted-foreground)',
};

const InfoRow: React.FC<{ label: string; align?: 'center' | 'baseline'; children: React.ReactNode }> = ({
  label,
  align = 'center',
  children,
}) => (
  <div style={{ display: 'flex', gap: '12px', alignItems: align }}>
    <span style={infoLabelStyle}>{label}</span>
    <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
  </div>
);

/** Замазанный номер: бэйдж с «шумной» серой цензурой (квадраты разной плотности). */
const CensoredPlate: React.FC = () => {
  // Разная прозрачность создаёт эффект шума, как у зацензуренного текста.
  const blocks = [0.55, 0.32, 0.5, 0.6, 0.38, 0.52];
  return (
    <span style={plateBadgeStyle} aria-label="Номер скрыт до бронирования" role="img">
      {blocks.map((o, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: '6px',
            height: '13px',
            borderRadius: '1.5px',
            background: `color-mix(in srgb, var(--muted-foreground) ${Math.round(o * 100)}%, transparent)`,
          }}
        />
      ))}
    </span>
  );
};

const TripDetailsScreen: React.FC<TripDetailsScreenProps> = ({
  trip,
  onBook,
  onOpenProfile,
  onCancelTrip,
  bookingFocusUserId,
  onClearBookingFocus,
}) => {
  // Десктоп (>=900px, issue #383, эпик #364): 2 колонки — контент + липкий aside с
  // действиями/сводкой мест, через ResponsiveTwoColumn. Мобиль/Telegram — одна колонка,
  // как раньше (примитив уже возвращает passthrough сам, здесь флаг нужен только для
  // локального решения — заворачивать ли aside-действия в Card и показывать ли сводку мест).
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const age = trip.driver.age || 34;
  const verified = trip.driver.verified !== false;
  const memberSince = trip.driver.memberSince || 'мая 2026';
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Двухшаговый arm/confirm для SOS (перенесено из удалённого InTripScreen,
  // issue #361): страхует от случайного вызова 112 при обычном тапе.
  const [sosArmed, setSosArmed] = useState(false);

  // Участники поездки («Кто едет») — для пассажира с активной бронью на чужую
  // поездку. Для своей поездки (isOwn) этот раздел заменяет секция «Брони»
  // (issue #339): там нужно управление (подтвердить/отклонить), а не просто список.
  const canSeeParticipants = !trip.isOwn && trip.booked === true;
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  useEffect(() => {
    const tripId = Number(trip.id);
    if (!canSeeParticipants || !Number.isFinite(tripId)) {
      setParticipants([]);
      return;
    }
    let cancelled = false;
    setLoadingParticipants(true);
    getTripParticipants(tripId)
      .then((res) => {
        if (!cancelled) setParticipants(res.participants);
      })
      .catch((err) => {
        console.error('Ошибка загрузки участников поездки:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingParticipants(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trip.id, canSeeParticipants]);

  const handleOpenParticipant = (userId: number) => {
    if (!onOpenProfile) return;
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    onOpenProfile(userId);
  };

  // Брони своей поездки (issue #339): водитель управляет ими прямо здесь —
  // подтвердить/отклонить. Переносит функциональность удалённого DriverBookingsScreen.
  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  // Локальный (не персистится на бэке — см. BookingCard) признак подтверждённых
  // в этой сессии броней: прячет кнопку «Подтвердить», оставляя «Отклонить».
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);

  useEffect(() => {
    const tripId = Number(trip.id);
    if (!trip.isOwn || !Number.isFinite(tripId)) {
      setBookings([]);
      return;
    }
    let cancelled = false;
    setLoadingBookings(true);
    getTripBookings(tripId)
      .then((res) => {
        if (!cancelled) setBookings(res.bookings);
      })
      .catch((err) => {
        console.error('Ошибка загрузки броней поездки:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingBookings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.isOwn]);

  const handleConfirmBooking = async (bookingId: number) => {
    setConfirmingId(bookingId);
    setConfirmedIds((prev) => new Set(prev).add(bookingId));
    try {
      await confirmBookingByDriver(bookingId);
      showToast('Бронь подтверждена');
    } catch (err) {
      setConfirmedIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      showToast(err instanceof ApiException ? err.message : 'Не удалось подтвердить бронь');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDeclineBooking = async (bookingId: number) => {
    setDecliningId(bookingId);
    try {
      await cancelBookingByDriver(bookingId);
      setBookings((prev) =>
        prev.map((b) => (b.booking_id === bookingId ? { ...b, status: 'cancelled_by_driver' } : b)),
      );
      showToast('Бронь отклонена');
    } catch (err) {
      showToast(err instanceof ApiException ? err.message : 'Ошибка отклонения брони');
    } finally {
      setDecliningId(null);
    }
  };

  const activeBookings = bookings.filter((b) => b.status === 'active');
  const takenSeats = activeBookings.reduce((sum, b) => sum + b.seats, 0);
  // Реальные места поездки (issue #339) — не FALLBACK, как было в удалённом DriverBookingsScreen.
  const totalSeats = trip.seatsTotal ?? trip.seats;
  const seatsLeft = Math.max(0, totalSeats - takenSeats);

  // Блюр-сценка BookingSpotlight: фокус на новейшей активной брони bookingFocusUserId
  // (issue #339), проигрывается один раз за фокус, пропускается при reduced-motion,
  // отсутствии брони или превышении 3с ожидания загрузки списка.
  const prefersReducedMotion = useReducedMotion();
  const [spotlightBooking, setSpotlightBooking] = useState<BookingDetail | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const spotlightPlayedRef = useRef(false);

  useEffect(() => {
    spotlightPlayedRef.current = false;
  }, [bookingFocusUserId]);

  useEffect(() => {
    if (!bookingFocusUserId || !trip.isOwn || spotlightPlayedRef.current) return;

    if (prefersReducedMotion) {
      onClearBookingFocus?.();
      return;
    }

    if (loadingBookings) {
      const t = window.setTimeout(() => {
        if (!spotlightPlayedRef.current) onClearBookingFocus?.();
      }, 3000);
      return () => window.clearTimeout(t);
    }

    const candidates = bookings.filter((b) => b.passenger_id === bookingFocusUserId && b.status === 'active');
    const target = candidates.reduce<BookingDetail | null>((latest, b) => {
      if (!latest) return b;
      return new Date(b.created_at) > new Date(latest.created_at) ? b : latest;
    }, null);

    if (!target) {
      onClearBookingFocus?.();
      return;
    }

    const el = document.querySelector<HTMLElement>(`[data-booking-id="${target.booking_id}"]`);
    if (!el) {
      onClearBookingFocus?.();
      return;
    }

    spotlightPlayedRef.current = true;
    setSpotlightRect(el.getBoundingClientRect());
    setSpotlightBooking(target);
  }, [bookingFocusUserId, trip.isOwn, loadingBookings, bookings, prefersReducedMotion, onClearBookingFocus]);

  const handleSpotlightDone = useCallback(() => {
    setSpotlightBooking(null);
    setSpotlightRect(null);
    onClearBookingFocus?.();
  }, [onClearBookingFocus]);

  // Дата+время выезда (для дня недели и определения прошедшей поездки).
  const departedAt = trip.tripDate ? new Date(`${trip.tripDate}T${trip.time}:00`) : null;
  const weekday = departedAt ? departedAt.toLocaleDateString('ru-RU', { weekday: 'long' }) : null;
  // Поездка завершена/отменена либо время выезда уже прошло — отменять нельзя.
  const isPast =
    trip.status === 'completed' ||
    trip.status === 'cancelled' ||
    (departedAt ? departedAt.getTime() < Date.now() : false);

  const handleBook = () => {
    if (trip.isOwn) {
      showToast('Нельзя забронировать свою поездку');
      return;
    }
    if (trip.booked) {
      showToast('Вы уже забронировали эту поездку');
      return;
    }
    onBook();
  };

  const handleConfirmCancel = () => {
    setCancelling(true);
    onCancelTrip?.();
  };

  // «Поделиться» (issue #361): та же Telegram-шеринг-петля, что и share.ts для
  // заявок пассажира (buildAlertDeepLink), только на конкретную поездку.
  const handleShareTrip = () => {
    hapticNotify('success');
    const from = trip.route?.from || `Брагино, ${trip.address}`;
    const to = trip.route?.to || 'Центр, пл. Волкова';
    shareToTelegram(
      `Еду ${from} → ${to}, выезд ${trip.time}. Присоединяйся в Yaride!`,
      buildTripDeepLink(Number(trip.id)),
    );
  };

  // SOS с двухшаговым arm/confirm (перенесено из InTripScreen): 1-й тап — предупреждение
  // с haptic 'warning', 2-й тап — реальный звонок 112 с haptic 'error'.
  const handleSosClick = () => {
    if (sosArmed) {
      hapticNotify('error');
      window.location.href = 'tel:112';
      setSosArmed(false);
      return;
    }
    hapticNotify('warning');
    setSosArmed(true);
  };

  const handleAvatarClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const driverId = (trip.driver as { id?: number }).id;
    if (driverId && onOpenProfile) {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      onOpenProfile(driverId);
    }
  };

  // Кнопки действий (Отменить/Забронировать + Поделиться/SOS) — извлечены в
  // переменную, чтобы переиспользовать один-в-один и в мобильном aside-слоте
  // (одна колонка), и в десктопном (issue #383, эпик #364). Логика/состояния/
  // обработчики не менялись — только вынесены из инлайн-JSX.
  const actionButtons = (
    <>
      {trip.isOwn ? (
        // Прошедшую/завершённую поездку отменять нельзя — действие скрыто.
        isPast ? null : confirmingCancel ? (
          <>
            <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center', lineHeight: 1.5 }}>
              Отменить поездку? Все брони будут сняты, пассажиры получат уведомление.
            </div>
            <Button
              variant="primary"
              onClick={handleConfirmCancel}
              disabled={cancelling}
              style={{ background: 'var(--destructive)', color: '#ffffff' }}
            >
              {cancelling ? 'Отменяем…' : 'Да, отменить поездку'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingCancel(false)} disabled={cancelling} style={{ minHeight: '44px' }}>
              Не отменять
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setConfirmingCancel(true)}
            style={{ minHeight: '48px', color: 'var(--destructive)', fontWeight: 700 }}
          >
            Отменить поездку
          </Button>
        )
      ) : (
        <>
          <Button
            variant="primary"
            onClick={handleBook}
            style={{
              ...(trip.booked && {
                opacity: 0.5,
                background: 'var(--muted)',
                color: 'var(--muted-foreground)',
                cursor: 'not-allowed',
              }),
            }}
          >
            Забронировать место
          </Button>
        </>
      )}
      {/* Поделиться + SOS (issue #361, перенесено из удалённого InTripScreen) —
          только на актуальном (не прошедшем) своём/забронированном рейсе: на
          чужом непросмотренном/незабронированном и на прошедшем рейсе шеринг
          и SOS бессмысленны. */}
      {!isPast && (trip.isOwn || trip.booked) && (
        <>
          <Button variant="ghost" icon="i-share" onClick={handleShareTrip} style={{ minHeight: '44px' }}>
            Поделиться
          </Button>
          <button
            type="button"
            className="focus-ring pressable"
            aria-label={sosArmed ? 'Подтвердить вызов помощи' : 'Кнопка SOS — вызвать помощь'}
            onClick={handleSosClick}
            style={{
              minHeight: '60px',
              padding: '12px 16px',
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontWeight: 800,
              fontSize: '16px',
              letterSpacing: '0.01em',
              border: 'none',
              background: 'var(--gradient-danger)',
              color: 'var(--danger-foreground)',
              boxShadow: 'var(--shadow-danger)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <Icon id="i-sos" style={{ width: '22px', height: '22px', strokeWidth: 2.2 }} />
            {sosArmed ? 'Нажми ещё раз — вызвать 112' : 'SOS — вызвать помощь'}
          </button>
          {sosArmed && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              Позвоним 112 и отправим геопозицию доверенному контакту.{' '}
              <button
                type="button"
                className="focus-ring"
                onClick={() => setSosArmed(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--foreground)',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  fontFamily: 'var(--font-sans)',
                  textDecoration: 'underline',
                }}
              >
                Отмена
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  // Сводка мест (issue #383): компактная строка «занято X из Y» в десктопном
  // aside — те же уже посчитанные takenSeats/totalSeats/seatsLeft, что и в
  // заголовке карточки «Брони» (main-слот), никакой новой логики/данных.
  const seatsSummary = trip.isOwn ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: '14px',
        background: 'var(--secondary)',
        fontSize: '13px',
        fontWeight: 700,
      }}
    >
      <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Занято мест</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {takenSeats} из {totalSeats}
      </span>
    </div>
  ) : null;

  // Aside-контент действий: на десктопе — карточка (Card) со сводкой мест сверху
  // действий, липнет через ResponsiveTwoColumn; на мобиле — прежний неоформленный
  // блок, прижатый книзу через marginTop:'auto' (issue #383, эпик #364).
  const asideContent = isDesktop ? (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      {seatsSummary}
      {actionButtons}
    </Card>
  ) : (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        marginTop: 'auto',
        paddingTop: '6px',
      }}
    >
      {actionButtons}
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
        gap: '12px',
      }}
    >
      <Header title={`Поездка ${trip.time}`} />

      {/* Десктоп (>=900px, issue #383, эпик #364): 2 колонки — main (карточка
          водителя/маршрут/детали/банер/брони) + липкий aside (действия +
          сводка мест), через ResponsiveTwoColumn. Мобиль/Telegram — прежняя
          одна колонка (main, затем aside), passthrough внутри примитива.
          Оборачиваем ВНУТРИ внешнего scroll/clearance-контейнера (padding с
          FLOATING_NAV_SCROLL_CLEARANCE выше) — сам контейнер не трогаем. */}
      <ResponsiveTwoColumn
        style={{ flex: 1 }}
        aside={<Appear delay={150}>{asideContent}</Appear>}
        main={
          <>
      <Appear delay={0}>
        <Card
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <div
          role={(trip.driver as { id?: number }).id && onOpenProfile ? 'button' : undefined}
          tabIndex={(trip.driver as { id?: number }).id && onOpenProfile ? 0 : undefined}
          aria-label={(trip.driver as { id?: number }).id && onOpenProfile ? `Открыть профиль ${trip.driver.name}` : undefined}
          onClick={(trip.driver as { id?: number }).id && onOpenProfile ? handleAvatarClick : undefined}
          onKeyDown={(trip.driver as { id?: number }).id && onOpenProfile ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAvatarClick(e);
            }
          } : undefined}
          style={{
            cursor: (trip.driver as { id?: number }).id && onOpenProfile ? 'pointer' : 'default',
            flexShrink: 0,
          }}
          className={(trip.driver as { id?: number }).id && onOpenProfile ? 'focus-ring pressable' : undefined}
        >
          <Avatar label={trip.driver.avatar} rating={trip.driver.rating} size={54} />
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>{trip.driver.name}</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              marginTop: '3px',
              lineHeight: 1.4,
            }}
          >
            <span
              style={{
                color: 'var(--foreground)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <Icon id="i-star" fill style={{ width: '11px', height: '11px', fill: 'var(--star)' }} />
              {trip.driver.rating}
            </span>{' '}
            · {trip.driver.tripCount}&nbsp;поездок · {age}&nbsp;года
          </div>
          {verified && (
            <div
              style={{
                color: 'var(--success)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                marginTop: '4px',
              }}
            >
              <Icon id="i-check" style={{ width: '14px', height: '14px' }} />
              ВУ подтверждено · с {memberSince}
            </div>
          )}
        </div>
        </Card>
      </Appear>

      <Appear delay={50}>
        <Card>
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
          Маршрут · ~{trip.route?.duration || '22 мин'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
            <RouteDot filled />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.route?.from || `Брагино, ${trip.address}`}
            </span>
          </div>
          <RouteMidConnector />
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
            <RouteDot />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.route?.to || 'Центр, пл. Волкова'}
            </span>
          </div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '13px',
            marginTop: '13px',
            fontSize: '15px',
          }}
        >
          <InfoRow label="Выезд">
            <b style={{ color: 'var(--foreground)', fontWeight: 700 }}>{weekday ? `${weekday}, ` : ''}{trip.time}</b>
          </InfoRow>
          {trip.car && (
            <InfoRow label="Машина">
              <b
                style={{
                  color: 'var(--foreground)',
                  fontWeight: 700,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {trip.car}{trip.carColor ? `, ${trip.carColor}` : ''}
              </b>
            </InfoRow>
          )}
          {(trip.plate || trip.plateLocked) && (
            <InfoRow label="Номер">
              {trip.plate ? (
                <span style={plateBadgeStyle}>{trip.plate}</span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <CensoredPlate />
                  <span style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>откроется после бронирования</span>
                </span>
              )}
            </InfoRow>
          )}
          {(trip.driverPhone || trip.driverPhoneLocked) && (
            <InfoRow label="Телефон">
              {trip.driverPhone ? (
                <PhoneLink phone={trip.driverPhone} name={trip.driver.name} />
              ) : (
                <span style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>
                  станет виден после подтверждения брони
                </span>
              )}
            </InfoRow>
          )}
          <InfoRow label="Бензин" align="baseline">
            <b style={{ color: 'var(--foreground)', fontWeight: 700 }}>≈ {trip.price} ₽</b>{' '}
            <span style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>(пополам · не оплата)</span>
          </InfoRow>
        </div>
        </Card>
      </Appear>

      <Appear delay={100}>
        <Card
        variant="accent"
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
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
        <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          Бензин ≈{trip.price} ₽ пополам — как подсказка для расчётов. Это информационный сервис, без платежей в
          приложении.
        </div>
        </Card>
      </Appear>

      {canSeeParticipants && (participants.length > 0 || loadingParticipants) && (
        <Appear delay={130}>
          <Card>
            <div
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted-foreground)',
                fontWeight: 700,
                marginBottom: '10px',
              }}
            >
              Кто едет
            </div>
            {loadingParticipants && participants.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Загрузка…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {participants.map((p) => {
                  const clickable = !!onOpenProfile;
                  return (
                    <div
                      key={p.user_id}
                      role={clickable ? 'button' : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      aria-label={clickable ? `Открыть профиль ${p.name}` : undefined}
                      onClick={clickable ? () => handleOpenParticipant(p.user_id) : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenParticipant(p.user_id);
                              }
                            }
                          : undefined
                      }
                      className={clickable ? 'focus-ring pressable' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                    >
                      <Avatar label={p.name.charAt(0)} rating={p.rating || undefined} size={40} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 600 }}>{p.name}</div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--muted-foreground)',
                            marginTop: '2px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <span>{p.role === 'driver' ? 'Водитель' : 'Попутчик'}</span>
                          {p.rating_count > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                              ·
                              <Icon id="i-star" fill style={{ width: '10px', height: '10px', fill: 'var(--star)' }} />
                              {p.rating}
                            </span>
                          )}
                          {p.license_verified && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--success)', fontWeight: 700 }}>
                              · <Icon id="i-check" style={{ width: '12px', height: '12px' }} /> ВУ
                            </span>
                          )}
                        </div>
                      </div>
                      {clickable && (
                        <Icon
                          id="i-arrow-r"
                          style={{ width: '16px', height: '16px', marginLeft: 'auto', color: 'var(--muted-foreground)' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Appear>
      )}

      {trip.isOwn && (
        <Appear delay={130}>
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--muted-foreground)',
                  fontWeight: 700,
                }}
              >
                Брони
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                {takenSeats} из {totalSeats} занято
                {seatsLeft === 0 && bookings.length > 0 ? ' · все места заняты' : ''}
              </div>
            </div>
            {loadingBookings && bookings.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Загрузка…</div>
            ) : activeBookings.length === 0 ? (
              // Отклонённые водителем и отменённые пассажиром брони не показываем —
              // в списке только активные (issue: чистим «Брони» от cancelled).
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '12px 0' }}>
                Пока нет броней
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {activeBookings.map((b) => (
                  <BookingCard
                    key={b.booking_id}
                    booking={b}
                    confirmed={confirmedIds.has(b.booking_id)}
                    confirming={confirmingId === b.booking_id}
                    declining={decliningId === b.booking_id}
                    onConfirm={handleConfirmBooking}
                    onDecline={handleDeclineBooking}
                  />
                ))}
              </div>
            )}
          </Card>
        </Appear>
      )}

      {spotlightBooking && spotlightRect && (
        <BookingSpotlight booking={spotlightBooking} rect={spotlightRect} onDone={handleSpotlightDone} />
      )}
          </>
        }
      />
    </div>
  );
};

export default TripDetailsScreen;
