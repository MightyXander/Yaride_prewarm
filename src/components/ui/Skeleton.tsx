import type { CSSProperties, ReactNode } from 'react';

/**
 * Skeleton — базовый плейсхолдер с shimmer-бликом.
 * Цвета и анимация берутся из CSS-переменных/кейфреймов в `src/index.css`
 * (--skel-base / --skel-sheen / @keyframes skeleton-shimmer).
 * prefers-reduced-motion гасит блик автоматически (см. index.css).
 *
 * Только inline-стили + класс `.skeleton` (без новых зависимостей).
 */
interface SkeletonProps {
  /** ширина (px или CSS-строка). По умолчанию 100% */
  w?: number | string;
  /** высота (px или CSS-строка) */
  h?: number | string;
  /** радиус скругления */
  r?: number | string;
  style?: CSSProperties;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ w = '100%', h = 14, r = 7, style, className }) => (
  <span
    aria-hidden="true"
    className={`skeleton${className ? ' ' + className : ''}`}
    style={{
      display: 'block',
      width: typeof w === 'number' ? `${w}px` : w,
      height: typeof h === 'number' ? `${h}px` : h,
      borderRadius: typeof r === 'number' ? `${r}px` : r,
      flexShrink: 0,
      ...style,
    }}
  />
);

/**
 * Slot — «кроссфейд на месте»: реальный контент задаёт геометрию, а поверх
 * лежит skeleton-маска, которая гаснет при готовности данных. Сдвига нет —
 * текст проявляется ровно там, где стоял плейсхолдер.
 *
 *   <Slot ready={!loading}>{driver.name}</Slot>
 *
 * Длительность кроссфейда — через CSS-переменную --rev (по умолчанию 420ms).
 */
interface SlotProps {
  ready: boolean;
  children: ReactNode;
  /** радиус маски */
  r?: number | string;
  /** доп. стиль маски (например, тёмная маска поверх жёлтого hero) */
  barStyle?: CSSProperties;
  /** контейнер inline (по умолчанию) или block */
  block?: boolean;
  style?: CSSProperties;
}

export const Slot: React.FC<SlotProps> = ({ ready, children, r = 7, barStyle, block = false, style }) => (
  <span
    style={{
      position: 'relative',
      display: block ? 'block' : 'inline-block',
      verticalAlign: 'top',
      maxWidth: '100%',
      ...style,
    }}
  >
    <span
      style={{
        display: block ? 'block' : 'inline-block',
        opacity: ready ? 1 : 0,
        transition: 'opacity var(--rev, 420ms) ease',
      }}
    >
      {children}
    </span>
    <span
      aria-hidden="true"
      className="skeleton"
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: typeof r === 'number' ? `${r}px` : r,
        opacity: ready ? 0 : 1,
        transition: 'opacity var(--rev, 420ms) ease',
        pointerEvents: 'none',
        ...barStyle,
      }}
    />
  </span>
);

export default Skeleton;
