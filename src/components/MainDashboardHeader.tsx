import { Icon } from './Icons';

interface MainDashboardHeaderProps {
  /** Маршрут в формате "Откуда → Куда" (то же значение, что мобильный Topbar/Hero получают как title). */
  title: string;
  /** Окно времени (то же значение, что мобильный Topbar/Hero получают как subtitle). */
  subtitle?: string;
  /** Готовая подпись счётчика поездок — тот же текст, что показывает мобильный Hero. */
  countLabel: string;
  onToggleDirection?: () => void;
}

/**
 * Десктоп-дашборд главного экрана (issue #382, эпик #364): заголовок секции +
 * горизонтальная строка «Откуда / Куда / Когда» над сеткой карточек поездок.
 * Переиспользует ТЕ ЖЕ данные и ту же логику, что мобильные Topbar+Hero
 * (title/subtitle/onToggleDirection приходят из screenRegistry.tsx без изменений) —
 * новой фильтрации нет, меняется только десктоп-представление существующих значений.
 * Единственное реальное управление списком — кнопка смены направления (тот же
 * onToggleDirection, что и в мобильном Hero).
 */
const MainDashboardHeader: React.FC<MainDashboardHeaderProps> = ({
  title,
  subtitle,
  countLabel,
  onToggleDirection,
}) => {
  const [from, to] = title.split(' → ');

  return (
    <div style={{ flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontSize: '26px',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              margin: 0,
              color: 'var(--foreground)',
            }}
          >
            Поездки
          </h2>
          <div style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
            {countLabel}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: 'var(--field)',
          border: '1px solid var(--field-border)',
          boxShadow: 'var(--field-shadow)',
          borderRadius: '18px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 16px',
            borderRight: '1px solid var(--field-border)',
          }}
        >
          <Icon id="i-pin" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '.03em',
              }}
            >
              Откуда
            </div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {from ?? title}
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 16px',
            borderRight: subtitle ? '1px solid var(--field-border)' : 'none',
          }}
        >
          <Icon id="i-pin" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '.03em',
              }}
            >
              Куда
            </div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {to ?? '—'}
            </div>
          </div>
        </div>

        {subtitle && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 16px',
            }}
          >
            <Icon id="i-clock" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--muted-foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '.03em',
                }}
              >
                Когда
              </div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {subtitle}
              </div>
            </div>
          </div>
        )}

        {onToggleDirection && (
          <button
            type="button"
            aria-label="Сменить направление"
            onClick={onToggleDirection}
            className="focus-ring pressable"
            style={{
              flexShrink: 0,
              width: '48px',
              margin: '6px',
              borderRadius: '14px',
              background: 'var(--gradient-brand)',
              color: 'var(--brand-foreground)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: 'var(--shadow-hero)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 4v16M7 4L4 7m3-3l3 3M17 20V4m0 16l3-3m-3 3l-3-3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default MainDashboardHeader;
