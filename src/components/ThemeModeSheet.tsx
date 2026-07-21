import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Icon } from './Icons';
import type { ThemeMode } from '../hooks/useTheme';
import { durationsMs, easings, prefersReducedMotion, springs } from '../lib/motion';

/**
 * Нижний лист выбора темы — три режима (светлая / тёмная / как в системе),
 * текущий отмечен галочкой. Паритет с Android (theme_mode_sheet.dart):
 * та же структура, подписи и порядок. Портал в body, spring снизу + fade
 * затемнения (токены lib/motion, issue #467), закрытие по фону/Esc.
 * Respect prefers-reduced-motion.
 */

interface ThemeModeSheetProps {
  open: boolean;
  mode: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
  onClose: () => void;
}

interface Option {
  value: ThemeMode;
  label: string;
  icon: React.ReactNode;
}

const sun = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
  </svg>
);
const moon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const auto = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
  </svg>
);

const OPTIONS: Option[] = [
  { value: 'light', label: 'Светлая', icon: sun },
  { value: 'dark', label: 'Тёмная', icon: moon },
  { value: 'system', label: 'Как в системе', icon: auto },
];

// (prefers-reduced-motion и токены анимаций — из ../lib/motion, issue #467)

const ThemeModeSheet: React.FC<ThemeModeSheetProps> = ({ open, mode, onSelect, onClose }) => {
  // mounted — держим в DOM во время анимации закрытия (уход шита вниз).
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (prefersReducedMotion) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(false), durationsMs.sheetUnmount);
    return () => clearTimeout(t);
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

  const pick = (m: ThemeMode) => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    onSelect(m);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Тема оформления"
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
        <div style={{ padding: '0 4px 8px', fontSize: '18px', fontWeight: 800, color: 'var(--foreground)' }}>
          Тема оформления
        </div>

        {OPTIONS.map((opt) => {
          const selected = opt.value === mode;
          return (
            <button
              key={opt.value}
              type="button"
              className="focus-ring pressable"
              onClick={() => pick(opt.value)}
              style={{
                width: '100%',
                minHeight: '52px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '10px 4px',
                background: 'transparent',
                border: 'none',
                borderRadius: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span
                aria-hidden
                style={{ display: 'grid', placeItems: 'center', flexShrink: 0, color: selected ? 'var(--brand-dark)' : 'var(--muted-foreground)' }}
              >
                {opt.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '16px', fontWeight: selected ? 700 : 600 }}>
                {opt.label}
              </span>
              {selected && <Icon id="i-check" style={{ width: '22px', height: '22px', color: 'var(--brand-dark)' }} />}
            </button>
          );
        })}
      </motion.div>
    </div>,
    document.body,
  );
};

export default ThemeModeSheet;
