import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { motion } from 'framer-motion';
import ScreenSkeleton from './ScreenSkeleton';
import { durations, easings, prefersReducedMotion } from '../lib/motion';

/**
 * Suspense-граница экрана с кроссфейдом skeleton → контент (issue #467).
 *
 * Обычный `<Suspense fallback={<ScreenSkeleton/>}>` подменяет skeleton
 * контентом резко, за один кадр. Здесь fallback помечает через ref, что
 * реально был показан (suspend случился), и тогда поверх смонтированного
 * контента на время кроссфейда рисуется копия skeleton, гаснущая до нуля.
 * Если экран пришёл из тёплого кэша (после прогрева #466 — типовой случай),
 * fallback не коммитится, флаг не взводится и контент рендерится напрямую,
 * без обёртки и без единого лишнего кадра.
 *
 * prefers-reduced-motion: кроссфейд отключён, подмена мгновенная (как раньше).
 */

const FallbackProbe: React.FC<{ flag: MutableRefObject<boolean> }> = ({ flag }) => {
  // useLayoutEffect: флаг взводится только если skeleton реально закоммичен
  // (показан хотя бы кадр), а не на выброшенном concurrent-рендере.
  useLayoutEffect(() => {
    flag.current = true;
  }, [flag]);
  return <ScreenSkeleton />;
};

const Reveal: React.FC<{ flag: MutableRefObject<boolean>; children: ReactNode }> = ({ flag, children }) => {
  // Решение однократное, на маунте контента: был ли перед ним skeleton.
  // Сразу сбрасываем флаг — следующий suspend этой же границы начнёт заново.
  const [crossfade] = useState(() => {
    const wasSuspended = flag.current;
    flag.current = false;
    return wasSuspended && !prefersReducedMotion;
  });
  const [overlayGone, setOverlayGone] = useState(!crossfade);

  if (!crossfade) return <>{children}</>;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {children}
      {!overlayGone && (
        <motion.div
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.crossfade, ease: easings.out }}
          onAnimationComplete={() => setOverlayGone(true)}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--background)',
          }}
        >
          <ScreenSkeleton />
        </motion.div>
      )}
    </div>
  );
};

const ScreenSuspense: React.FC<{ children: ReactNode }> = ({ children }) => {
  const suspendedRef = useRef(false);
  return (
    <Suspense fallback={<FallbackProbe flag={suspendedRef} />}>
      <Reveal flag={suspendedRef}>{children}</Reveal>
    </Suspense>
  );
};

export default ScreenSuspense;
