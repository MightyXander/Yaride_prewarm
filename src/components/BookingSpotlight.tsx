import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BookingCard from './BookingCard';
import type { BookingDetail } from '../types/api';

/**
 * Блюр-сценка при заходе в TripDetailsScreen из уведомления о новой брони
 * (issue #339): 6с таймлайн 2-2-2 (наведение блюра → удержание → снятие),
 * фокус — клон карточки нового пассажира поверх смазанного фона (те же
 * координаты, что у настоящей карточки в списке «Брони», через
 * getBoundingClientRect). Тап в любой момент — быстрый (~200мс) досрочный
 * дисмисс. prefers-reduced-motion обрабатывает вызывающий код (TripDetailsScreen) —
 * этот компонент вообще не монтируется в таком случае.
 */
export interface BookingSpotlightProps {
  booking: BookingDetail;
  rect: DOMRect;
  onDone: () => void;
}

const PHASE_MS = 2000;
const MAX_BLUR_PX = 14;
const DISMISS_MS = 200;

type Phase = 'in' | 'hold' | 'out' | 'dismissing';

const BookingSpotlight: React.FC<BookingSpotlightProps> = ({ booking, rect, onDone }) => {
  const [phase, setPhase] = useState<Phase>('in');
  // onDone в ref — таймеры не должны пере-регистрироваться при смене колбэка родителя.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase('hold'), PHASE_MS),
      window.setTimeout(() => setPhase('out'), PHASE_MS * 2),
      window.setTimeout(() => onDoneRef.current(), PHASE_MS * 3),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const dismiss = () => {
    if (phase === 'dismissing') return;
    setPhase('dismissing');
    window.setTimeout(() => onDoneRef.current(), DISMISS_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (typeof document === 'undefined') return null;

  const blurred = phase === 'in' || phase === 'hold';
  const transitionMs = phase === 'dismissing' ? DISMISS_MS : PHASE_MS;
  const blurValue = `blur(${blurred ? MAX_BLUR_PX : 0}px)`;

  return createPortal(
    <div
      role="presentation"
      aria-label="Новая бронь — коснитесь, чтобы закрыть"
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        cursor: 'pointer',
        backdropFilter: blurValue,
        WebkitBackdropFilter: blurValue,
        transition: `backdrop-filter ${transitionMs}ms ease, -webkit-backdrop-filter ${transitionMs}ms ease`,
      }}
    >
      {/* Клон карточки нового пассажира поверх блюра, в тех же координатах —
          backdrop-filter родителя блюрит только то, что позади него, поэтому
          дочерний узел остаётся резким (тот же приём, что у FloatingNav). */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          pointerEvents: 'none',
        }}
      >
        <BookingCard
          booking={booking}
          confirmed={false}
          confirming={false}
          declining={false}
          onConfirm={() => {}}
          onDecline={() => {}}
        />
      </div>
    </div>,
    document.body,
  );
};

export default BookingSpotlight;
