/**
 * Empty state для пустого списка поездок — по эталону (иконка-кружок + CTA «Оставить заявку»).
 */

import { EmptyState } from './ui/StateView';

interface EmptyTripsStateProps {
  onLeaveRequest?: () => void;
}

const EmptyTripsState: React.FC<EmptyTripsStateProps> = ({ onLeaveRequest }) => (
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
      onLeaveRequest && (
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
      )
    }
  />
);

export default EmptyTripsState;
