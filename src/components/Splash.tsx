import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

interface SplashProps {
  /** Когда true, splash начинает уход (fade out) */
  onHide: boolean;
  /** Колбэк, вызываемый когда анимация ухода завершена */
  onHidden?: () => void;
}

/**
 * Splash-экран при запуске: бренд-знак на тёмном фоне (единая палитра).
 * - При onHide=true начинается fade out с небольшим scale up
 * - После завершения анимации вызывается onHidden
 * - reduced-motion: мгновенное исчезновение
 */
const Splash: React.FC<SplashProps> = ({ onHide, onHidden }) => {
  const prefersReduced = useReducedMotion();
  const [isGone, setIsGone] = useState(false);

  useEffect(() => {
    if (onHide) {
      if (prefersReduced) {
        // Мгновенно убираем
        setIsGone(true);
        onHidden?.();
      } else {
        // Ждём завершения анимации (0.5s transition)
        const timer = setTimeout(() => {
          setIsGone(true);
          onHidden?.();
        }, 550);
        return () => clearTimeout(timer);
      }
    }
  }, [onHide, prefersReduced, onHidden]);

  // Если splash полностью ушёл, больше не рендерим
  if (isGone) return null;

  const containerClass = onHide ? 'splash is-hidden' : 'splash';

  return (
    <div
      className={containerClass}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        // Фон зафиксирован тёмным (не var(--background)): сплеш в одной палитре
        // с бренд-знаком независимо от темы приложения.
        background: '#0f0f12',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: onHide ? 'none' : 'auto',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Мягкое бренд-свечение под знаком — глубина на тёмном фоне */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 221, 45, 0.18), transparent 68%)',
            pointerEvents: 'none',
          }}
        />
        <img
          className="splash-logo"
          src="/brand/icon-512.png"
          alt="поехали вместе"
          style={{
            position: 'relative',
            width: '132px',
            height: 'auto',
            display: 'block',
            // drop-shadow следует альфа-каналу (скруглённая иконка), а не прямоугольнику
            filter: 'drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55))',
          }}
        />
      </div>
    </div>
  );
};

export default Splash;
