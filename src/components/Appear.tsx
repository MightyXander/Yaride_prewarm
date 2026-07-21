import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import type { ReactNode, CSSProperties } from 'react';

// Токены анимаций и статический prefers-reduced-motion — из общего модуля (issue #467).
import { durations, easings, listStaggerMs, prefersReducedMotion } from '../lib/motion';

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

// При reduced-motion НЕ анимируем и opacity: иначе мгновенные переходы 0↔1
// (skeleton → контент при загрузке) дают видимое мигание экрана. Контент всегда видим.
const appearVariants: Variants = {
  hidden: {
    opacity: prefersReducedMotion ? 1 : 0,
    y: prefersReducedMotion ? 0 : 6,
  },
  visible: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: prefersReducedMotion ? 1 : 0,
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
  const duration = prefersReducedMotion || instant ? 0 : durations.base;
  const exitDuration = prefersReducedMotion || instant ? 0 : durations.fast; // exit короче enter

  // `initial={false}` (а не только duration: 0) — компонент монтируется сразу в
  // конечном состоянии "visible", без единого кадра со значениями "hidden"
  // (issue #438): при remount мимо тёплого кэша duration:0 всё равно проигрывал
  // бы hidden→visible за 1 кадр, что на медленных устройствах может читаться
  // как микро-мигание. `instant` используют экраны, где ремаунт не должен быть
  // заметен вообще (напр. NotificationsScreen при свайпе между разделами).
  const content = (
    <motion.div
      initial={prefersReducedMotion || instant ? false : 'hidden'}
      animate="visible"
      exit="exit"
      variants={appearVariants}
      transition={{
        duration,
        delay: prefersReducedMotion ? 0 : delay / 1000, // ms → s; при reduced-motion без stagger-задержки
        ease: easings.out,
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
            ease: easings.out,
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
  stagger = listStaggerMs,
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
          initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: prefersReducedMotion ? 1 : 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : durations.fast,
            ease: easings.out,
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
