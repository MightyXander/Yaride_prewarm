/**
 * RouteDemandScreen — «Вас ждут попутчики»: агрегированный спрос по коридору для
 * водителя (подписки на маршрут). Показывает, сколько пассажиров подписались и
 * ждут поездку по направлению/дате/времени, и даёт опубликовать поездку в один
 * тап. Недостающая половина петли подписок: пассажир подписывается → водитель
 * видит спрос здесь → публикует → подписчикам летит push с кнопкой «Забронировать».
 *
 * Точки входа: баннер на главной (DriverBanner) и deep-link `alert-<id>`
 * (шеринг подписки пассажира наружу, см. useStartParam).
 */
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { LoadErrorState, EmptyState } from '../components/ui/StateView';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { Skeleton } from '../components/ui/Skeleton';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { hapticImpact } from '../lib/haptics';
import { useScreenData, useDelayedFlag } from '../hooks/useScreenData';
import { fetchDemand } from '../lib/screenFetchers';
import type { DemandSlot } from '../types/api';
import { Appear, AppearList } from '../components/Appear';
import { ResponsiveColumn } from '../components/ui/ResponsiveColumn';

interface RouteDemandScreenProps {
  /** Опубликовать поездку (переход на форму водителя). */
  onPublish?: (slot?: DemandSlot) => void;
}

// Дата спроса: Сегодня/Завтра/дд мес + точное время (или «любое время») —
// тот же формат, что MyAlertsScreen.formatAlertDate.
function formatDemandWhen(desiredDate: string, desiredTime: string | null): string {
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
}

// Русская плюрализация «человек»: 1 человек, 2–4 человека, 0/5+ человек
// (11–14 по двум последним цифрам — всегда «человек»).
function peopleCount(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return `${n} человек`;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n} человека`;
  return `${n} человек`;
}

const waitVerb = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? 'ждёт' : 'ждут');

const AvatarStack: React.FC<{ names: string[]; total: number }> = ({ names, total }) => {
  const shown = names.slice(0, 3);
  const extra = total - shown.length;
  const base: React.CSSProperties = {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: '2px solid var(--card)',
    fontWeight: 800,
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((n, i) => (
        <span
          key={i}
          style={{
            ...base,
            marginLeft: i === 0 ? 0 : '-9px',
            background: 'var(--gradient-brand)',
            color: 'var(--brand-foreground)',
          }}
        >
          {(n.trim().charAt(0) || 'П').toUpperCase()}
        </span>
      ))}
      {extra > 0 && (
        <span style={{ ...base, marginLeft: '-9px', background: 'var(--secondary)', color: 'var(--foreground)' }}>
          +{extra}
        </span>
      )}
    </div>
  );
};

const RouteDemandScreen: React.FC<RouteDemandScreenProps> = ({ onPublish }) => {
  const { data: demand = [], loading, error, refetch } = useScreenData<DemandSlot[]>('route-demand', fetchDemand);
  const showSkeleton = useDelayedFlag(loading, 180);

  const hero = demand[0];
  const rest = demand.slice(1);

  const handlePublish = (slot?: DemandSlot) => {
    if (!onPublish) return;
    hapticImpact('light');
    onPublish(slot);
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: `6px 16px ${FLOATING_NAV_SCROLL_CLEARANCE}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ResponsiveColumn style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        <Header title="Вас ждут попутчики" />

        <AnimatePresence mode="wait">
          {loading ? (
            showSkeleton ? (
              <Appear key="loading-skeleton" instant>
                <>
                  {[1, 2, 3].map((i) => (
                    <Card key={i} style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '84px', marginBottom: '10px' }}>
                      <Skeleton h={14} w="45%" r={7} />
                      <Skeleton h={16} w="70%" r={8} />
                    </Card>
                  ))}
                </>
              </Appear>
            ) : null
          ) : error ? (
            <Appear key="error" animateKey="error">
              <LoadErrorState onRetry={() => { void refetch(); }} />
            </Appear>
          ) : demand.length === 0 ? (
            <Appear key="empty" animateKey="empty">
              <EmptyState
                icon={<Icon id="i-clock" style={{ width: '32px', height: '32px', strokeWidth: 1.6 }} />}
                title="Пока никто не ждёт поездку"
                subtitle="Опубликуйте поездку — попутчики подтянутся, а подписчики маршрута получат уведомление."
              />
              {onPublish && (
                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '320px', margin: '16px auto 0' }}>
                  <Button variant="primary" onClick={() => handlePublish()}>
                    Опубликовать поездку
                  </Button>
                </div>
              )}
            </Appear>
          ) : (
            <AppearList key="demand" animateKey="demand" stagger={40} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '14.5px', color: 'var(--muted-foreground)', fontWeight: 500, lineHeight: 1.5 }}>
                По маршруту <b style={{ color: 'var(--foreground)', fontWeight: 700 }}>{hero.fromTitle} → {hero.toTitle}</b> и обратно люди уже ищут поездку. Опубликуйте — они забронируют место, деньги за бензин пополам.
              </div>

              {/* Герой — самый крупный слот спроса */}
              <Card style={{ display: 'flex', flexDirection: 'column', gap: '13px', background: 'linear-gradient(180deg, var(--accent) 0%, var(--card) 46%)', border: '1px solid color-mix(in srgb, var(--brand) 55%, var(--border))' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--brand-dark)' }}>
                  {formatDemandWhen(hero.desiredDate, hero.desiredTime)} · {hero.fromTitle} → {hero.toTitle}
                </div>
                <div style={{ fontSize: '23px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.12 }}>
                  {peopleCount(hero.count)} {waitVerb(hero.count)} поездку
                </div>
                <AvatarStack names={hero.sampleNames} total={hero.count} />
                {onPublish && (
                  <Button variant="primary" onClick={() => handlePublish(hero)}>
                    Опубликовать поездку
                  </Button>
                )}
              </Card>

              {rest.length > 0 && (
                <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '2px' }}>Ещё ждут по маршруту</div>
              )}

              {rest.map((slot, i) => (
                <button
                  key={i}
                  type="button"
                  className="focus-ring pressable"
                  onClick={() => handlePublish(slot)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '13px 14px',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    boxShadow: 'var(--shadow-card)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--foreground)',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '15.5px', fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {slot.fromTitle} → {slot.toTitle}
                    </span>
                    <span style={{ display: 'block', fontSize: '13px', color: 'var(--muted-foreground)', fontWeight: 500, marginTop: '2px' }}>
                      {formatDemandWhen(slot.desiredDate, slot.desiredTime)}
                    </span>
                  </span>
                  <AvatarStack names={slot.sampleNames} total={slot.count} />
                  <span style={{ fontWeight: 800, fontSize: '15px', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{slot.count}</span>
                  <Icon id="i-arrow-r" style={{ width: '18px', height: '18px', color: 'var(--muted-foreground)', flexShrink: 0 }} />
                </button>
              ))}
            </AppearList>
          )}
        </AnimatePresence>
      </ResponsiveColumn>
    </div>
  );
};

export default RouteDemandScreen;
