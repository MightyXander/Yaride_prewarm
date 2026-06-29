/**
 * Empty state для пустого списка поездок — по эталону.
 * Иконка-кружок + заголовок/подзаголовок + CTA «Оставить заявку» и (для водителя) «Создать поездку».
 */

import { EmptyState } from './ui/StateView';

interface EmptyTripsStateProps {
  onLeaveRequest?: () => void;
  /** Создать поездку (показывается только водителю — гейтинг публикации). */
  onPublish?: () => void;
  showPublish?: boolean;
  /** Сменить направление маршрута — чтобы из пустого направления посмотреть обратное без перезахода. */
  onToggleDirection?: () => void;
}

const EmptyTripsState: React.FC<EmptyTripsStateProps> = ({ onLeaveRequest, onPublish, showPublish, onToggleDirection }) => (
  <EmptyState
    icon={
      <svg viewBox="0 0 24 24" style={{ width: '34px', height: '34px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
        <path d="M5 11l1.7-4.3A2 2 0 0 1 8.6 5.4h6.8a2 2 0 0 1 1.9 1.3L19 11" />
        <rect x="3" y="11" width="18" height="6" rx="2.2" />
        <circle cx="7.5" cy="17.5" r="1.4" />
        <circle cx="16.5" cy="17.5" r="1.4" />
      </svg>
    }
    title="Поездок пока нет"
    subtitle="На это время по маршруту никто не едет. Оставь заявку — водители увидят, что ты ищешь."
    action={
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px' }}>
        {onLeaveRequest && (
          <button
            type="button"
            onClick={onLeaveRequest}
            className="focus-ring pressable"
            style={{
              minHeight: '48px',
              padding: '0 22px',
              borderRadius: '18px',
              border: 'none',
              background: 'var(--gradient-brand)',
              color: 'var(--brand-foreground)',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-hero)',
            }}
          >
            Оставить заявку
          </button>
        )}
        {onToggleDirection && (
          <button
            type="button"
            onClick={onToggleDirection}
            className="focus-ring pressable"
            style={{
              minHeight: '48px',
              padding: '0 22px',
              borderRadius: '18px',
              border: '1px solid var(--field-border)',
              background: 'var(--field)',
              boxShadow: 'var(--field-shadow)',
              color: 'var(--foreground)',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '9px',
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: '17px', height: '17px', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
              <path d="M17 4l3 3-3 3" />
              <path d="M20 7H8" />
              <path d="M7 14l-3 3 3 3" />
              <path d="M4 17h12" />
            </svg>
            Сменить направление
          </button>
        )}
        {showPublish && onPublish && (
          <button
            type="button"
            onClick={onPublish}
            className="focus-ring pressable"
            style={{
              minHeight: '48px',
              padding: '0 22px',
              borderRadius: '18px',
              border: '1px solid var(--field-border)',
              background: 'var(--field)',
              boxShadow: 'var(--field-shadow)',
              color: 'var(--foreground)',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '9px',
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: '17px', height: '17px', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Создать поездку
          </button>
        )}
      </div>
    }
  />
);

export default EmptyTripsState;
