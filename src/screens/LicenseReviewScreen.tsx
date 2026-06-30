import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { useProfile } from '../contexts/ProfileContext';

interface LicenseReviewScreenProps {
  onFindRide: () => void;
  onRetry: () => void;
}

// Статус модерации ВУ.
type ReviewStatus = 'pending' | 'approved' | 'declined';

interface TimelineStep {
  label: string;
  done: boolean;
  active?: boolean;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

interface StatusMeta {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  sub: string;
}

const STATUS_META: Record<ReviewStatus, StatusMeta> = {
  pending: {
    icon: 'i-clock',
    iconColor: 'var(--brand-foreground)',
    iconBg: 'var(--gradient-brand)',
    title: 'Заявка на проверке',
    sub: 'обычно одобряем за пару часов',
  },
  approved: {
    icon: 'i-check',
    iconColor: '#fff',
    iconBg: 'linear-gradient(135deg, #34d27b, #1f9d57)',
    title: 'ВУ подтверждено',
    sub: 'теперь можно создавать поездки',
  },
  declined: {
    icon: 'i-x',
    iconColor: '#fff',
    iconBg: 'linear-gradient(135deg, #ff6a5a, #e53935)',
    title: 'Заявка отклонена',
    sub: 'фото нечитаемо — загрузите ещё раз',
  },
};

const timelineFor = (status: ReviewStatus): TimelineStep[] => [
  { label: 'Заявка отправлена', done: true },
  {
    label: status === 'pending' ? 'Проверка модератором' : 'Проверена модератором',
    done: status !== 'pending',
    active: status === 'pending',
  },
  {
    label:
      status === 'approved'
        ? 'ВУ подтверждено'
        : status === 'declined'
          ? 'Отклонено'
          : 'Решение',
    done: status !== 'pending',
  },
];

const LicenseReviewScreen: React.FC<LicenseReviewScreenProps> = ({ onFindRide, onRetry }) => {
  // Реальный статус ВУ из профиля (ProfileContext из #102).
  // Маппинг: 'verified'→approved, 'rejected'/'declined'→declined, иначе→pending.
  const { profile } = useProfile();
  const rawStatus = profile?.license_status ?? '';
  const status: ReviewStatus =
    rawStatus === 'verified' ? 'approved' : rawStatus === 'rejected' || rawStatus === 'declined' ? 'declined' : 'pending';
  const meta = STATUS_META[status];
  const steps = timelineFor(status);

  // Реальные данные заявки ВУ (из профиля). null — заявок нет, блок «Отправлено» скрываем.
  const licenseSeries = profile?.license_series ?? null;
  const licenseValidUntil = profile?.license_valid_until ?? null;
  // Маскируем последнюю группу цифр номера: ···+последние 3 цифры.
  const maskSeries = (s: string): string => {
    const parts = s.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    if (/^\d{4,}$/.test(last)) parts[parts.length - 1] = `···${last.slice(-3)}`;
    return parts.join(' ');
  };
  // Срок действия 'YYYY-MM-DD' → 'MM/YYYY'; иной формат показываем как есть.
  const formatValid = (v: string): string => {
    const m = /^(\d{4})-(\d{2})-\d{2}/.exec(v);
    return m ? `${m[2]}/${m[1]}` : v;
  };

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
      <Header title="Заявка водителя" />

      {/* Статусный блок */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '14px 8px 6px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '22px',
            background: meta.iconBg,
            display: 'grid',
            placeItems: 'center',
            color: meta.iconColor,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <Icon id={meta.icon} style={{ width: '30px', height: '30px', strokeWidth: 2.4 }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: '19px', letterSpacing: '-0.01em', marginTop: '12px' }}>
          {meta.title}
        </div>
        <div style={{ fontSize: '15px', color: 'var(--muted-foreground)', marginTop: '3px' }}>
          {meta.sub}
        </div>
      </div>

      {/* Таймлайн модерации */}
      <Card>
        <div style={sectionLabelStyle}>Статус проверки</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const dotColor = step.done
              ? status === 'declined' && isLast
                ? '#e53935'
                : 'var(--success)'
              : step.active
                ? 'var(--brand)'
                : 'var(--border)';
            return (
              <div key={step.label} style={{ display: 'flex', gap: '11px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span
                    style={{
                      width: '13px',
                      height: '13px',
                      borderRadius: '999px',
                      flexShrink: 0,
                      marginTop: '3px',
                      background: step.done || step.active ? dotColor : 'transparent',
                      border: `2px solid ${dotColor}`,
                    }}
                  />
                  {!isLast && (
                    <span
                      style={{
                        width: '2px',
                        flex: 1,
                        minHeight: '18px',
                        background: step.done ? 'var(--success)' : 'var(--border)',
                        margin: '2px 0',
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: step.active || (isLast && step.done) ? 700 : 600,
                    color: step.done || step.active ? 'var(--foreground)' : 'var(--muted-foreground)',
                    paddingBottom: isLast ? 0 : '8px',
                  }}
                >
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Что отправлено — реальные данные заявки; без заявки блок не показываем */}
      {licenseSeries && (
        <Card>
          <div style={sectionLabelStyle}>Отправлено</div>
          <div style={{ fontSize: '15px', color: 'var(--foreground)', lineHeight: 1.6 }}>
            ВУ {maskSeries(licenseSeries)}
            {licenseValidUntil ? ` · до ${formatValid(licenseValidUntil)}` : ''}
          </div>
        </Card>
      )}

      {/* Поясняющая плашка */}
      <Card variant="accent" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
          }}
        >
          <Icon id="i-bell" style={{ width: '18px', height: '18px' }} />
        </div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          {status === 'approved'
            ? 'Можно опубликовать первую поездку прямо сейчас.'
            : status === 'declined'
              ? 'Проверьте, что номер совпадает с фото, и отправьте заявку ещё раз.'
              : 'Пришлём пуш, когда одобрим. Пока можно искать поездки как пассажир.'}
        </div>
      </Card>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        {status === 'declined' ? (
          <Button variant="primary" icon="i-shield" onClick={onRetry}>
            Отправить заявку заново
          </Button>
        ) : (
          <Button variant="ghost" icon="i-search" onClick={onFindRide}>
            Найти поездку
          </Button>
        )}
      </div>
    </div>
  );
};

export default LicenseReviewScreen;
