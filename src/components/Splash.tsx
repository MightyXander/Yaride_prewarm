import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

interface SplashProps {
  /** Когда true, splash начинает уход (fade out) */
  onHide: boolean;
  /** Колбэк, вызываемый когда анимация ухода завершена */
  onHidden?: () => void;
}

/**
 * Splash-экран при запуске: лого + слоган.
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
        background: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: onHide ? 'none' : 'auto',
      }}
    >
      <img
        className="splash-logo"
        src="/brand/logo.png"
        alt="поехали вместе — карпуллинг в Ярославле"
        style={{
          width: '300px',
          maxWidth: '80%',
          height: 'auto',
          display: 'block',
        }}
      />
    </div>
  );
};

export default Splash;
