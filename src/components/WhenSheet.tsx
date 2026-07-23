import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Calendar from './ui/Calendar';
import Button from './ui/Button';
import { hapticSelection, hapticImpact } from '../lib/haptics';
import { durationsMs, easings, prefersReducedMotion, springs } from '../lib/motion';

/**
 * Нижний лист выбора даты и времени отправления («Когда едем?») — issue #465.
 * Паритет с паттерном ThemeModeSheet: портал в body, spring снизу + fade
 * затемнения (токены lib/motion, issue #467), закрытие по фону/Esc,
 * respect prefers-reduced-motion.
 *
 * Выбор ЯВНЫЙ: до «Готово» ничего в фоновом экране не меняется. Быстрые опции
 * (Сегодня / Завтра / Другая дата) переключают только черновик; «Другая дата»
 * раскрывает Calendar. Секция времени — чипы слотов текущего окна + «Любое».
 */

export const ANY_TIME = 'Любое';

interface WhenSheetProps {
  open: boolean;
  /** Применённая дата (YYYY-MM-DD). */
  selectedDate: string;
  /** Применённое время (HH:MM или «Любое»). */
  preferredTime: string;
  /** Сегодняшняя дата (YYYY-MM-DD). */
  today: string;
  /** Завтрашняя дата (YYYY-MM-DD). */
  tomorrow: string;
  /** Слоты времени текущего направления. */
  timeSlots: string[];
  /** Применить выбор: дата + время. */
  onApply: (date: string, time: string) => void;
  onClose: () => void;
}

type Quick = 'today' | 'tomorrow' | 'other';

// (prefers-reduced-motion и токены анимаций — из ../lib/motion, issue #467)

const QUICK_OPTIONS: Array<{ key: Quick; label: string }> = [
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Завтра' },
  { key: 'other', label: 'Другая дата' },
];

const WhenSheet: React.FC<WhenSheetProps> = ({
  open,
  selectedDate,
  preferredTime,
  today,
  tomorrow,
  timeSlots,
  onApply,
  onClose,
}) => {
  // mounted — держим в DOM во время анимации закрытия (уход шита вниз).
  const [mounted, setMounted] = useState(open);

  // Черновик выбора — инициализируется от применённых значений при открытии.
  const [draftDate, setDraftDate] = useState(selectedDate || today);
  const [draftTime, setDraftTime] = useState(preferredTime || ANY_TIME);
  const initialQuick: Quick =
    !selectedDate || selectedDate === today ? 'today' : selectedDate === tomorrow ? 'tomorrow' : 'other';
  const [quick, setQuick] = useState<Quick>(initialQuick);

  useEffect(() => {
    if (open) {
      // Ресетим черновик к текущему применённому состоянию при каждом открытии.
      const d = selectedDate || today;
      setDraftDate(d);
      setDraftTime(preferredTime || ANY_TIME);
      setQuick(d === today ? 'today' : d === tomorrow ? 'tomorrow' : 'other');
      setMounted(true);
      return;
    }
    if (prefersReducedMotion) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(false), durationsMs.sheetUnmount);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc закрывает.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const reduce = prefersReducedMotion;

  const pickQuick = (key: Quick) => {
    hapticSelection();
    setQuick(key);
    if (key === 'today') setDraftDate(today);
    else if (key === 'tomorrow') setDraftDate(tomorrow);
  };

  const pickTime = (time: string) => {
    hapticSelection();
    setDraftTime(time);
  };

  const apply = () => {
    hapticImpact('light');
    onApply(draftDate, draftTime);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Когда едем"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Затемнение — отдельный слой с fade (issue #467). */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: durationsMs.sheetBackdrop / 1000, ease: easings.inOut }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.5)' }}
      />
      {/* Шит: spring на подъёме, tween на уходе (соразмерен sheetUnmount). */}
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { y: '100%' }}
        animate={{ y: open ? 0 : '100%' }}
        transition={
          reduce
            ? { duration: 0 }
            : open
              ? springs.sheet
              : { duration: durationsMs.sheetExit / 1000, ease: easings.inOut }
        }
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '430px',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--card)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-elevated)',
          padding: '10px 16px calc(env(safe-area-inset-bottom) + 16px)',
          willChange: reduce ? 'auto' : 'transform',
        }}
      >
        {/* Drag-handle */}
        <div
          aria-hidden
          style={{ width: '40px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 12px' }}
        />
        <div style={{ padding: '0 4px 12px', fontSize: '18px', fontWeight: 800, color: 'var(--foreground)' }}>
          Когда едем?
        </div>

        {/* Быстрые опции */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {QUICK_OPTIONS.map((opt) => {
            const active = quick === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                className="focus-ring pressable"
                aria-pressed={active}
                onClick={() => pickQuick(opt.key)}
                style={{
                  minHeight: '44px',
                  borderRadius: '14px',
                  border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                  background: active ? 'var(--accent)' : 'var(--secondary)',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: active ? 800 : 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  padding: '0 6px',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Календарь для «Другая дата» — плавное раскрытие (grid-rows 0fr→1fr +
            opacity/margin, тот же приём, что у DriverPublishScreen; respect
            reduced-motion). Блок всегда в DOM, чтобы анимировать и открытие, и
            сворачивание при переключении на «Сегодня/Завтра». */}
        <div
          aria-hidden={quick !== 'other'}
          style={{
            display: 'grid',
            gridTemplateRows: quick === 'other' ? '1fr' : '0fr',
            opacity: quick === 'other' ? 1 : 0,
            marginTop: quick === 'other' ? '16px' : 0,
            transition: reduce
              ? 'none'
              : 'grid-template-rows 0.28s ease-out, opacity 0.28s ease-out, margin-top 0.28s ease-out',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <Calendar
              value={draftDate}
              onChange={(date) => setDraftDate(date)}
              minDate={new Date(`${today}T00:00:00`)}
            />
          </div>
        </div>

        {/* Время отправления */}
        <div style={{ marginTop: '18px' }}>
          <div style={{ padding: '0 4px 8px', fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>
            Время отправления
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 2px' }}>
            {[ANY_TIME, ...timeSlots].map((slot) => {
              const active = draftTime === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  className="focus-ring pressable"
                  aria-pressed={active}
                  onClick={() => pickTime(slot)}
                  style={{
                    minHeight: '40px',
                    padding: '0 14px',
                    borderRadius: '999px',
                    border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                    background: active ? 'var(--brand)' : 'var(--secondary)',
                    color: active ? 'var(--brand-foreground)' : 'var(--foreground)',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: active ? 800 : 600,
                    fontSize: '14px',
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'pointer',
                  }}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <Button variant="primary" haptic="none" onClick={apply} style={{ width: '100%' }}>
            Готово
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default WhenSheet;
