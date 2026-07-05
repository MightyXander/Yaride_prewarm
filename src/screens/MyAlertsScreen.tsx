import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import { RouteDot, RouteMidConnector } from '../components/ui/RouteConnector';
import { LoadErrorState, EmptyState } from '../components/ui/StateView';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { Skeleton } from '../components/ui/Skeleton';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { hapticImpact, hapticNotify } from '../lib/haptics';
import { cancelAlert } from '../lib/api';
import { useScreenData, useDelayedFlag } from '../hooks/useScreenData';
import { fetchMyAlerts } from '../lib/screenFetchers';
import type { MyAlertItem } from '../types/api';
import { Appear, AppearList } from '../components/Appear';

interface MyAlertsScreenProps {
  /** Перейти к форме создания заявки (пустой список → «Оставить заявку»). */
  onCreateAlert?: () => void;
}

// Дата заявки: Сегодня/Завтра/дд мес — тот же формат, что MyTripsScreen.formatTime.
const formatAlertDate = (desiredDate: string, desiredTime: string | null): string => {
  const date = new Date(`${desiredDate}T${desiredTime ?? '00:00'}`);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dayLabel =
    date.toDateString() === today.toDateString()
      ? 'Сегодня'
      : date.toDateString() === tomorrow.toDateString()
        ? 'Завтра'
        : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  return desiredTime ? `${dayLabel}, ${desiredTime}` : `${dayLabel}, любое время`;
};

const MyAlertsScreen: React.FC<MyAlertsScreenProps> = ({ onCreateAlert }) => {
  const { data: alerts = [], loading, error, refetch, mutate } = useScreenData<MyAlertItem[]>('my-alerts', fetchMyAlerts);
  const showSkeleton = useDelayedFlag(loading, 180);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelErrorId, setCancelErrorId] = useState<number | null>(null);

  const handleCancel = async (alertId: number) => {
    if (cancellingId !== null) return;
    hapticImpact('light');
    setCancelErrorId(null);
    setCancellingId(alertId);
    try {
      await cancelAlert(alertId);
      // Обновляем и кэш, и текущий стейт (issue #352) — при возврате на экран
      // отменённая заявка не должна воскреснуть из протухшего кэша.
      mutate((prev) => (prev ?? []).filter((a) => a.id !== alertId));
    } catch (err) {
      console.error('[MyAlertsScreen] Ошибка отмены заявки:', err);
      setCancelErrorId(alertId);
      hapticNotify('error');
    } finally {
      setCancellingId(null);
    }
  };

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
      <Header title="Мои заявки" />

      <AnimatePresence mode="wait">
        {loading ? (
          showSkeleton ? (
            <Appear key="loading-skeleton" instant>
              <>
                {[1, 2].map((i) => (
                  <Card key={i} style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '110px', marginBottom: '12px' }}>
                    <Skeleton h={16} w="50%" r={8} />
                    <Skeleton h={14} w="90%" r={7} />
                    <Skeleton h={14} w="90%" r={7} />
                  </Card>
                ))}
              </>
            </Appear>
          ) : null
        ) : error ? (
          <Appear key="error" animateKey="error">
            <LoadErrorState onRetry={() => { void refetch(); }} />
          </Appear>
        ) : alerts.length === 0 ? (
          <Appear key="empty" animateKey="empty">
            <EmptyState
              icon={<Icon id="i-bell" style={{ width: '32px', height: '32px', strokeWidth: 1.6 }} />}
              title="Активных заявок нет"
              subtitle="Оставь заявку на маршрут — как только водитель опубликует подходящую поездку, ты узнаешь."
            />
          </Appear>
        ) : (
          <AppearList key="alerts" animateKey="alerts" stagger={40} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alerts.map((alert) => {
              const isCancelling = cancellingId === alert.id;
              return (
                <Card key={alert.id} style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '16px',
                      letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatAlertDate(alert.desiredDate, alert.desiredTime)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
                      <RouteDot filled />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {alert.fromTitle}
                      </span>
                    </div>
                    <RouteMidConnector />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '24px', fontSize: '15px', fontWeight: 600 }}>
                      <RouteDot />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {alert.toTitle}
                      </span>
                    </div>
                  </div>

                  {cancelErrorId === alert.id && (
                    <div style={{ fontSize: '12px', color: 'var(--destructive-foreground)', background: 'var(--destructive)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
                      Не удалось отменить заявку. Попробуй ещё раз.
                    </div>
                  )}

                  <button
                    type="button"
                    className="focus-ring pressable"
                    onClick={() => { void handleCancel(alert.id); }}
                    disabled={cancellingId !== null}
                    style={{
                      marginTop: '3px',
                      minHeight: '40px',
                      padding: '0 16px',
                      borderRadius: '14px',
                      border: '1px solid var(--field-border)',
                      background: 'var(--field)',
                      boxShadow: 'var(--field-shadow)',
                      color: 'var(--foreground)',
                      fontWeight: 700,
                      fontSize: '14px',
                      fontFamily: 'var(--font-sans)',
                      cursor: cancellingId !== null ? 'default' : 'pointer',
                      opacity: cancellingId !== null && !isCancelling ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                    }}
                  >
                    {isCancelling ? 'Отменяем…' : 'Отменить заявку'}
                  </button>
                </Card>
              );
            })}
          </AppearList>
        )}
      </AnimatePresence>

      {!loading && !error && onCreateAlert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
          <button
            type="button"
            className="focus-ring pressable"
            onClick={() => {
              hapticImpact('light');
              onCreateAlert();
            }}
            style={{
              minHeight: '48px',
              borderRadius: '18px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--foreground)',
              fontWeight: 600,
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            Оставить новую заявку
          </button>
        </div>
      )}
    </div>
  );
};

export default MyAlertsScreen;
