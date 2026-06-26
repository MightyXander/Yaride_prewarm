import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import type { ReactNode, CSSProperties } from 'react';

// prefers-reduced-motion: отключаем анимацию
const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface AppearProps {
  children: ReactNode;
  /** Ключ для AnimatePresence — когда меняется, контент кроссфейдится */
  animateKey?: string | number;
  /** Задержка перед появлением (ms), для stagger-эффекта */
  delay?: number;
  /** Отключить анимацию (instant) */
  instant?: boolean;
  /** CSS стили */
  style?: CSSProperties;
  /** CSS класс */
  className?: string;
}

const appearVariants: Variants = {
  hidden: {
    opacity: 0,
    y: prefersReducedMotion ? 0 : 6,
  },
  visible: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: prefersReducedMotion ? 0 : 3,
  },
};

/**
 * Примитив плавного появления контента: fade + лёгкий подъём (translateY).
 * Respect prefers-reduced-motion (мгновенно, без движения).
 * Для списков используй AppearList (обёртка со stagger).
 */
export const Appear: React.FC<AppearProps> = ({
  children,
  animateKey,
  delay = 0,
  instant = false,
  style,
  className,
}) => {
  const duration = prefersReducedMotion || instant ? 0 : 0.21; // 210ms
  const exitDuration = prefersReducedMotion || instant ? 0 : 0.15; // exit короче enter

  const content = (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={appearVariants}
      transition={{
        duration,
        delay: delay / 1000, // ms → s
        ease: [0.25, 0.1, 0.25, 1], // ease-out
      }}
      style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform', ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );

  if (animateKey !== undefined) {
    return (
      <AnimatePresence mode="wait">
        {/* При смене animateKey — кроссфейд (exit → enter) */}
        <motion.div
          key={animateKey}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={appearVariants}
          transition={{
            duration: exitDuration,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform', ...style }}
          className={className}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  return content;
};

interface AppearListProps {
  children: ReactNode[];
  /** Задержка между элементами (stagger, ms) */
  stagger?: number;
  /** Ключ для AnimatePresence — когда меняется, весь список кроссфейдится */
  animateKey?: string | number;
  /** CSS стили */
  style?: CSSProperties;
  /** CSS класс */
  className?: string;
}

/**
 * Обёртка для списка: каждый дочерний элемент появляется со stagger-задержкой.
 * Используй для карточек/списков, чтобы создать волновой эффект появления.
 */
export const AppearList: React.FC<AppearListProps> = ({
  children,
  stagger = 40, // 40ms по умолчанию
  animateKey,
  style,
  className,
}) => {
  const childArray = Array.isArray(children) ? children : [children];

  const content = (
    <div style={style} className={className}>
      {childArray.map((child, index) => (
        <Appear key={index} delay={index * stagger}>
          {child}
        </Appear>
      ))}
    </div>
  );

  if (animateKey !== undefined) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={animateKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.15,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          style={style}
          className={className}
        >
          {childArray.map((child, index) => (
            <Appear key={index} delay={index * stagger}>
              {child}
            </Appear>
          ))}
        </motion.div>
      </AnimatePresence>
    );
  }

  return content;
};
