import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { subscribeToast } from '../lib/toast';

// Минимальный тост: показывает короткое сообщение и сам гаснет.
// Заглушка для ещё не реализованных действий (чат, фильтры, настройки),
// чтобы не было «мёртвых» кнопок без фидбека.

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = subscribeToast((m) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2400);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {msg && (
        <motion.div
          key={msg}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
          transition={prefersReduced ? { duration: 0.12 } : { type: 'spring', stiffness: 500, damping: 40 }}
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            margin: '0 auto',
            width: 'fit-content',
            maxWidth: 'min(340px, calc(100% - 32px))',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
            zIndex: 200,
            padding: '11px 18px',
            borderRadius: '999px',
            background: 'var(--foreground)',
            color: 'var(--background)',
            fontSize: '15px',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            boxShadow: 'var(--shadow-elevated)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
