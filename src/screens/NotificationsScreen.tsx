import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Card from '../components/ui/Card';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { Skeleton } from '../components/ui/Skeleton';
import { LoadErrorState, EmptyState } from '../components/ui/StateView';
import { Appear } from '../components/Appear';
import { ResponsiveColumn } from '../components/ui/ResponsiveColumn';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { markNotificationRead, clearNotifications } from '../lib/api';
import { useScreenData, useDelayedFlag } from '../hooks/useScreenData';
import { fetchNotifications } from '../lib/screenFetchers';
import { hapticImpact } from '../lib/haptics';
import { showToast } from '../lib/toast';
import type { NotificationItem, NotificationType } from '../types/api';

interface NotificationsScreenProps {
  /** Callback для навигации по тапу на уведомление (маршрутизация) */
  onNavigate: (type: NotificationType, refTripId?: number | null, refUserId?: number | null) => void;
}

/** Дистанция «улёта» карточки за пределы экрана при удалении. */
const EXIT_FLING_DISTANCE = 480;
/** Задержка между исчезновением карточек при «Очистить» (stagger, ms). */
const CLEAR_STAGGER_MS = 60;
/** Длительность exit-анимации одной карточки (ms) — ждём перед clear-запросом. */
const CLEAR_ITEM_DURATION_MS = 260;

/** Иконка + цвет по типу уведомления (вынесено из компонента — не требует пропсов). */
function getNotificationIcon(type: NotificationType): { icon: string; color: string } {
  switch (type) {
    case 'booking':
      return { icon: 'i-calendar', color: 'var(--brand)' };
    case 'booking_confirmed':
      return { icon: 'i-check', color: 'var(--success)' };
    case 'cancel':
      return { icon: 'i-x', color: 'var(--destructive)' };
    case 'rate_reminder':
      return { icon: 'i-star', color: 'var(--star)' };
    case 'trip_new':
      return { icon: 'i-car', color: 'var(--brand)' };
    case 'license_approved':
      return { icon: 'i-check', color: 'var(--success)' };
    case 'license_rejected':
      return { icon: 'i-x', color: 'var(--destructive)' };
    default:
      return { icon: 'i-bell', color: 'var(--muted-foreground)' };
  }
}

// Форматирование относительного времени: «только что», «5 мин назад», «2 ч назад», «вчера», «3 дня назад»
function formatRelativeTime(isoDate: string): string {
  const now = new Date();
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHr < 24) return `${diffHr} ч назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дня назад`;

  // Более 7 дней — показываем дату «ДД месяц»
  const monthNames = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
  ];
  const day = then.getDate();
  const month = monthNames[then.getMonth()];
  return `${day} ${month}`;
}

interface NotificationCardProps {
  notif: NotificationItem;
  /** Индекс в текущем списке — только для stagger-задержки появления. */
  index: number;
  reducedMotion: boolean;
  onClick: (notif: NotificationItem) => void;
}

/**
 * Одна карточка уведомления — motion.div с layout (плавное схлопывание высоты при
 * удалении соседей), входной stagger-анимацией и exit-«улётом» (для «Очистить»).
 * По горизонтали зафиксирована (issue #422): свайп по карточке переключает раздел
 * карусели (жест ведёт обёртка App), сама карточка не ездит. Тап навигирует.
 */
const NotificationCard: React.FC<NotificationCardProps> = ({ notif, index, reducedMotion, onClick }) => {
  const { icon, color } = getNotificationIcon(notif.type);
  const isUnread = !notif.read;

  return (
    <motion.div
      // Карточка ЗАФИКСИРОВАНА по горизонтали (issue #422): свайп по ней переключает
      // раздел карусели (жест ведёт обёртка App), карточка сама не ездит. БЕЗ framer
      // `layout`: scrub-слой каждый кадр меняет transform панели, а layout замерял бы
      // экранную позицию карточки (с учётом трансформа предка) и догонял её пружиной —
      // карточки «летали» бы за панелью с лагом. Схлопывание при удалении и так идёт
      // нормальным потоком (сосед следует за анимацией height уходящей карточки).
      initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        x: reducedMotion ? 0 : EXIT_FLING_DISTANCE,
        height: 0,
        marginBottom: 0,
        transition: { duration: reducedMotion ? 0 : 0.22, ease: [0.4, 0, 1, 1] },
      }}
      transition={{
        // Вход (opacity/y): stagger-задержка только на монтировании.
        duration: reducedMotion ? 0 : 0.18,
        delay: reducedMotion ? 0 : index * 0.045,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      style={{ overflow: 'hidden' }}
    >
      <Card
        role="button"
        tabIndex={0}
        aria-label={`${notif.title}: ${notif.body}`}
        onClick={() => onClick(notif)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(notif);
          }
        }}
        className="focus-ring pressable"
        style={{
          padding: '14px',
          cursor: 'pointer',
          background: isUnread ? 'var(--card)' : 'var(--muted)',
          borderLeft: isUnread ? `3px solid ${color}` : 'none',
          touchAction: 'pan-y',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* Иконка типа уведомления */}
          <div
            style={{
              flexShrink: 0,
              width: '40px',
              height: '40px',
              borderRadius: '999px',
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon
              id={icon}
              fill={notif.type === 'booking_confirmed' || notif.type === 'license_approved'}
              style={{
                width: '20px',
                height: '20px',
                color,
              }}
            />
          </div>

          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Заголовок + время */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: isUnread ? 800 : 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {notif.title}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--muted-foreground)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatRelativeTime(notif.created_at)}
              </div>
            </div>

            {/* Текст уведомления */}
            <div
              style={{
                fontSize: '14px',
                color: 'var(--foreground)',
                lineHeight: 1.5,
                opacity: isUnread ? 1 : 0.85,
              }}
            >
              {notif.body}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

/**
 * NotificationsScreen — лента пушей пользователя (handoff Шаг 7).
 *
 * Список уведомлений: иконка типа, заголовок, текст, относительное время, акцент непрочитанных.
 * Типы: booking (бронь твоей поездки), booking_confirmed (твою бронь подтвердили),
 * cancel (отмена водителем/пассажиром), rate_reminder (напоминание оценить).
 *
 * Маршрутизация тапа: booking → TripDetails (секция «Брони» + блюр-сценка на новом
 * пассажире, issue #339); booking_confirmed → TripDetails; cancel → TripDetails;
 * rate_reminder → RateTrip.
 *
 * Загрузка — скелетоны. Пусто — «Пока нет уведомлений».
 *
 * Удаление — кнопкой «Очистить» (issue #337): карточки убираются по очереди (stagger),
 * затем POST /api/notifications/clear; при ошибке список восстанавливается целиком.
 * Свайп по карточке не удаляет её, а переключает раздел карусели (issue #422): карточка
 * зафиксирована по горизонтали, жест ведёт обёртка App.
 */
const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ onNavigate }) => {
  const {
    data: notifications = [],
    loading,
    error,
    refetch,
    mutate,
  } = useScreenData<NotificationItem[]>('notifications', fetchNotifications);
  const showSkeleton = useDelayedFlag(loading, 180);
  const [clearing, setClearing] = useState(false);
  // Синхронный guard от повторного входа: React-состояние clearing коммитится
  // асинхронно, и два клика подряд (до коммита ре-рендера) оба видят
  // clearing=false и запускают параллельные последовательности — ref читается/
  // пишется немедленно и не подвержен этой гонке.
  const clearingRef = useRef(false);
  const reducedMotion = useReducedMotion() ?? false;

  const handleNotificationClick = async (notif: NotificationItem) => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');

    // Пометить как прочитанное
    if (!notif.read) {
      try {
        await markNotificationRead(notif.id);
        mutate((prev) => (prev ?? []).map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
      } catch (err) {
        console.error('Ошибка пометки уведомления как прочитанного:', err);
      }
    }

    // Маршрутизация
    onNavigate(notif.type, notif.ref_trip_id, notif.ref_user_id);
  };


  // Кнопка «Очистить» (issue #337): карточки исчезают по очереди (stagger),
  // затем один POST /notifications/clear. Ошибка — список восстанавливается целиком.
  const handleClearAll = useCallback(() => {
    if (notifications.length === 0 || clearingRef.current) return;
    clearingRef.current = true;

    hapticImpact('medium');
    setClearing(true);
    const snapshot = notifications;
    const staggerMs = reducedMotion ? 0 : CLEAR_STAGGER_MS;
    const itemDurationMs = reducedMotion ? 0 : CLEAR_ITEM_DURATION_MS;

    snapshot.forEach((n, i) => {
      window.setTimeout(() => {
        mutate((prev) => (prev ?? []).filter((x) => x.id !== n.id));
      }, i * staggerMs);
    });

    const totalWait = snapshot.length * staggerMs + itemDurationMs;
    window.setTimeout(() => {
      void (async () => {
        try {
          await clearNotifications();
        } catch (err) {
          console.error('Ошибка очистки уведомлений:', err);
          mutate(snapshot);
          showToast('Не удалось очистить уведомления. Попробуйте ещё раз.');
        } finally {
          clearingRef.current = false;
          setClearing(false);
        }
      })();
    }, totalWait);
  }, [notifications, reducedMotion, mutate]);

  // Скелетон уведомления (та же геометрия, что и реальное)
  const NotificationSkeleton: React.FC = () => (
    <Card style={{ padding: '14px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Skeleton w={40} h={40} r={999} />
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <Skeleton w="60%" h={15} r={7} />
            <Skeleton w="25%" h={12} r={6} />
          </div>
          <Skeleton w="100%" h={14} r={7} />
          <Skeleton w="70%" h={14} r={7} />
        </div>
      </div>
    </Card>
  );

  // Пусто только когда реально нечего чистить (а не в процессе «Очистить», где
  // массив временно пустеет карточка за карточкой раньше, чем придёт ответ API).
  const showEmpty = notifications.length === 0 && !clearing && !loading && !error;

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px',
        paddingBottom: FLOATING_NAV_SCROLL_CLEARANCE,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Десктоп (>=900px): центрированная читаемая колонка ~640px вместо растяжения
          на всю ширину десктоп-оболочки (1100px); мобиль/Telegram — passthrough (issue #373). */}
      <ResponsiveColumn style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Header title="Уведомления" />

        <AnimatePresence mode="wait">
          {loading ? (
            showSkeleton ? (
              <Appear key="loading">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <NotificationSkeleton />
                  <NotificationSkeleton />
                  <NotificationSkeleton />
                </div>
              </Appear>
            ) : null
          ) : error ? (
            <Appear key="error">
              <LoadErrorState
                subtitle="Не удалось загрузить уведомления. Проверь соединение и попробуй ещё раз."
                onRetry={() => { void refetch(); }}
              />
            </Appear>
          ) : showEmpty ? (
            <Appear key="empty">
              <EmptyState
                icon={
                  <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                }
                title="Пока нет уведомлений"
                subtitle="Здесь появятся брони, подтверждения и напоминания оценить поездку."
              />
            </Appear>
          ) : (
            <Appear key="list">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <AnimatePresence>
                  {notifications.map((notif, index) => (
                    <NotificationCard
                      key={notif.id}
                      notif={notif}
                      index={index}
                      reducedMotion={reducedMotion}
                      onClick={(n) => void handleNotificationClick(n)}
                    />
                  ))}
                </AnimatePresence>

                {(notifications.length > 0 || clearing) && (
                  <button
                    type="button"
                    className="focus-ring pressable"
                    disabled={clearing}
                    onClick={handleClearAll}
                    style={{
                      minHeight: '44px',
                      padding: '10px 18px',
                      borderRadius: '18px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--muted-foreground)',
                      fontWeight: 600,
                      fontSize: '14px',
                      fontFamily: 'var(--font-sans)',
                      cursor: clearing ? 'not-allowed' : 'pointer',
                      opacity: clearing ? 0.5 : 1,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    Очистить
                  </button>
                )}
              </div>
            </Appear>
          )}
        </AnimatePresence>
      </ResponsiveColumn>
    </div>
  );
};

export default NotificationsScreen;
