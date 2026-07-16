import Card from './ui/Card';
import { Icon } from './Icons';

interface WomenRideEmptyStateProps {
  /** Сменить направление маршрута — вторичное действие (дизайн 2.4, «если применимо»). */
  onToggleDirection?: () => void;
}

/**
 * Empty-состояние режима женских поездок (дизайн women-ride 2.4): когда включён
 * women_only, но по маршруту нет ни одной женской поездки. Честный блок-приглашение;
 * секция «Остальные — с мужчинами» всё равно показывается ниже (уехать можно).
 */
const WomenRideEmptyState: React.FC<WomenRideEmptyStateProps> = ({ onToggleDirection }) => (
  <Card
    style={{
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: '12px',
    }}
  >
    <div
      style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'var(--secondary)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--muted-foreground)',
        flexShrink: 0,
      }}
    >
      <Icon id="i-shield" style={{ width: '28px', height: '28px' }} />
    </div>
    <div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>
        По вашему маршруту женских поездок сейчас нет
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--muted-foreground)',
          lineHeight: 1.5,
          marginTop: '6px',
          maxWidth: '34ch',
        }}
      >
        Можно уехать с мужчинами — SOS и «Поделиться с близкими» доступны в любой поездке.
      </div>
    </div>
    {onToggleDirection && (
      <button
        type="button"
        onClick={onToggleDirection}
        className="focus-ring pressable"
        style={{
          minHeight: '44px',
          padding: '0 20px',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          background: 'var(--secondary)',
          color: 'var(--secondary-foreground)',
          fontWeight: 700,
          fontSize: '14px',
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
        }}
      >
        Изменить маршрут
      </button>
    )}
  </Card>
);

export default WomenRideEmptyState;
