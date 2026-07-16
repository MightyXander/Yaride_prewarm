import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './ui/Button';
import { showToast } from '../lib/toast';
import { hapticNotify } from '../lib/haptics';
import { shareToTelegram, nativeShare, copyToClipboard } from '../lib/share';

/**
 * Safety-share: отдаём доверенному человеку ПОЛНУЮ инфу о поездке для контроля
 * безопасности (в отличие от вирального «Позвать попутчиков»). Каркас —
 * ThemeModeSheet.tsx один-в-один: портал в body, role="dialog" aria-modal,
 * слайд снизу + затемнение, закрытие по фону/Esc, drag-handle, safe-area,
 * respect prefers-reduced-motion. Меняется только контент.
 */

export interface SafetyShareRow {
  label: string;
  value: string;
  /** Табличные цифры для номера — ровный столбец. */
  tabular?: boolean;
}

interface SafetyShareSheetProps {
  open: boolean;
  onClose: () => void;
  /** Строки сводки поездки (маршрут/когда/водитель/авто/номер). */
  rows: SafetyShareRow[];
  /** Готовый текст для копирования и шеринга (со ссылкой). */
  text: string;
  /** Deep-link на поездку — url для navigator.share. */
  url: string;
  /** Доверенный контакт из safety-настроек. null — не задан. */
  trustedContact: { name: string; phone: string } | null;
  /** Открыть SafetyScreen (блок «Доверенный контакт»). */
  onAddContact: () => void;
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

const SafetyShareSheet: React.FC<SafetyShareSheetProps> = ({
  open,
  onClose,
  rows,
  text,
  url,
  trustedContact,
  onAddContact,
}) => {
  // mounted — держим в DOM во время анимации закрытия; shown — целевое состояние (слайд).
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    // Сброс «Скопировано», чтобы при следующем открытии кнопка была idle.
    setCopied(false);
    clearTimeout(copiedTimer.current);
    if (prefersReducedMotion) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

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

  const handleSendTrusted = () => {
    hapticNotify('success');
    shareToTelegram(text, url);
    onClose();
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok) {
      showToast('Не удалось скопировать');
      return;
    }
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = () => {
    void nativeShare({ title: 'Поездка в Yaride', text, url });
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Поделиться с близкими"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: `rgba(0,0,0,${shown ? 0.5 : 0})`,
        transition: reduce ? 'none' : `background 220ms ${EASE}`,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'var(--card)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-elevated)',
          padding: '10px 16px calc(env(safe-area-inset-bottom) + 16px)',
          transform: reduce || shown ? 'translateY(0)' : 'translateY(100%)',
          transition: reduce ? 'none' : `transform 260ms ${EASE}`,
          willChange: reduce ? 'auto' : 'transform',
        }}
      >
        {/* Drag-handle */}
        <div
          aria-hidden
          style={{ width: '40px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 12px' }}
        />
        <div style={{ padding: '0 4px 2px', fontSize: '18px', fontWeight: 800, color: 'var(--foreground)' }}>
          Поделиться с близкими
        </div>
        <div style={{ padding: '0 4px 12px', fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
          Отправьте детали поездки тому, кому доверяете.
        </div>

        {/* Сводка поездки */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px 12px',
            background: 'var(--secondary)',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '14px',
          }}
        >
          {rows.map((row) => (
            <Fragment key={row.label}>
              <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>{row.label}</span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  fontVariantNumeric: row.tabular ? 'tabular-nums' : undefined,
                }}
              >
                {row.value}
              </span>
            </Fragment>
          ))}
        </div>

        {/* Primary: отправить доверенному, либо карточка-подсказка «нет контакта». */}
        {trustedContact ? (
          <Button variant="primary" onClick={handleSendTrusted} style={{ width: '100%', marginBottom: '10px' }}>
            Отправить {trustedContact.name}
          </Button>
        ) : (
          <div
            style={{
              background: 'var(--accent)',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '10px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Нет доверенного контакта</div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted-foreground)', lineHeight: 1.5, margin: '4px 0 12px' }}>
              Добавьте близкого человека — сможете отправлять ему поездки в один тап.
            </div>
            <Button variant="secondary" onClick={onAddContact} style={{ width: '100%', minHeight: '44px' }}>
              Добавить контакт
            </Button>
          </div>
        )}

        {/* Скопировать + Поделиться… */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            variant="secondary"
            icon={copied ? 'i-check' : 'i-copy'}
            onClick={handleCopy}
            style={{
              flex: 1,
              ...(copied && { background: 'var(--success)', color: 'var(--success-foreground)' }),
            }}
          >
            {copied ? 'Скопировано' : 'Скопировать'}
          </Button>
          <Button variant="ghost" icon="i-share" onClick={handleNativeShare} style={{ flex: 1 }}>
            Поделиться…
          </Button>
        </div>
        {/* Озвучивание успеха копирования скринридером (success-feedback). */}
        <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {copied ? 'Скопировано' : ''}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SafetyShareSheet;
