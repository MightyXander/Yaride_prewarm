import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { Skeleton } from '../components/ui/Skeleton';
import { LoadErrorState, EmptyState } from '../components/ui/StateView';
import { Appear, AppearList } from '../components/Appear';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { getNotifications, markNotificationRead } from '../lib/api';
import type { NotificationItem, NotificationType } from '../types/api';

interface NotificationsScreenProps {
  /** Callback для навигации по тапу на уведомление (маршрутизация) */
  onNavigate: (type: NotificationType, refTripId?: number | null, refUserId?: number | null) => void;
}

/**
 * NotificationsScreen — лента пушей пользователя (handoff Шаг 7).
 *
 * Список уведомлений: иконка типа, заголовок, текст, относительное время, акцент непрочитанных.
 * Типы: booking (бронь твоей поездки), booking_confirmed (твою бронь подтвердили),
 * cancel (отмена водителем/пассажиром), rate_reminder (напоминание оценить).
 *
 * Маршрутизация тапа: booking → DriverBookings/«Мои поездки»; booking_confirmed → TripDetails;
 * cancel → TripDetails; rate_reminder → RateTrip.
 *
 * Загрузка — скелетоны. Пусто — «Пока нет уведомлений».
 */
const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ onNavigate }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // silent=true — тихий рефетч (без скелета) для обновления по фокусу.
  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const res = await getNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      console.error('Ошибка загрузки уведомлений:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Возврат фокуса/видимости вкладки → свежая лента уведомлений.
  useRefetchOnFocus(() => {
    void loadNotifications(true);
  });

  // Форматирование относительного времени: «только что», «5 мин назад», «2 ч назад», «вчера», «3 дня назад»
  const formatRelativeTime = (isoDate: string): string => {
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
  };

  // Иконка + цвет по типу уведомления
  const getNotificationIcon = (type: NotificationType): { icon: string; color: string } => {
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
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');

    // Пометить как прочитанное
    if (!notif.read) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
        );
      } catch (err) {
        console.error('Ошибка пометки уведомления как прочитанного:', err);
      }
    }

    // Маршрутизация
    onNavigate(notif.type, notif.ref_trip_id, notif.ref_user_id);
  };

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

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px',
        paddingBottom: FLOATING_NAV_SCROLL_CLEARANCE,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Header title="Уведомления" />

      <AnimatePresence mode="wait">
        {loading ? (
          <Appear key="loading">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <NotificationSkeleton />
              <NotificationSkeleton />
              <NotificationSkeleton />
            </div>
          </Appear>
        ) : error ? (
          <Appear key="error">
            <LoadErrorState
              subtitle="Не удалось загрузить уведомления. Проверь соединение и попробуй ещё раз."
              onRetry={() => { void loadNotifications(); }}
            />
          </Appear>
        ) : notifications.length === 0 ? (
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
          <AppearList
            key="list"
            stagger={55}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {notifications.map((notif) => {
              const { icon, color } = getNotificationIcon(notif.type);
              const isUnread = !notif.read;

              return (
                <Card
                  key={notif.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${notif.title}: ${notif.body}`}
                  onClick={() => void handleNotificationClick(notif)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleNotificationClick(notif);
                    }
                  }}
                  className="focus-ring pressable"
                  style={{
                    padding: '14px',
                    cursor: 'pointer',
                    background: isUnread ? 'var(--card)' : 'var(--muted)',
                    borderLeft: isUnread ? `3px solid ${color}` : 'none',
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
              );
            })}
          </AppearList>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationsScreen;
