import type { CSSProperties, ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT } from '../../lib/layout';

// Переиспользуемый паттерн десктоп-сетки для списков карточек (issue #367, эпик #364,
// пилот-итерация). Экраны, которые в дальнейшем получат десктоп-полиш (MyTrips, MyCars,
// MyAlerts, Notifications, ...) должны переиспользовать этот паттерн, а не изобретать
// свою сетку заново.
//
// Правило раскладки:
// - Десктоп (>= DESKTOP_BREAKPOINT, см. lib/layout.ts): CSS grid,
//   repeat(auto-fill, minmax(minColumnPx, 1fr)) — несколько колонок, без «осиротевших»
//   пустых полос (1fr тянет колонки на всю ширину).
// - Мобиль/Telegram (< DESKTOP_BREAKPOINT): одна колонка (flex-column), как было раньше.

export interface ResponsiveCardGridOptions {
  /** Минимальная ширина карточки в десктоп-сетке, при которой добавляется ещё одна колонка. */
  minColumnPx?: number;
  /** Отступ между карточками — общий для сетки и мобильной колонки. */
  gap?: string;
}

/**
 * Хук-версия паттерна: возвращает «сырые» CSS-стили десктоп-сетки/мобильной колонки.
 * Используй, когда список карточек уже обёрнут в существующий контейнер с анимацией
 * (например `AppearList` — см. `src/screens/MainScreen.tsx`), и нужно просто подставить
 * стиль в его `style`-проп, не добавляя лишний оборачивающий div.
 */
export function useResponsiveCardGridStyle({
  minColumnPx = 320,
  gap = '14px',
}: ResponsiveCardGridOptions = {}): CSSProperties {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);

  return isDesktop
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnPx}px, 1fr))`,
        // items не растягиваются по высоте строки — раскрытая (аккордеон) карточка
        // не «тянет» соседей по строке до своей высоты.
        alignItems: 'start',
        gap,
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        gap,
      };
}

interface ResponsiveCardGridProps extends ResponsiveCardGridOptions {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/**
 * Готовый контейнер-обёртка для простых списков карточек (без своей анимации/stagger) —
 * оборачиваешь список карточек, получаешь десктоп-сетку/мобильную колонку «из коробки».
 */
export const ResponsiveCardGrid: React.FC<ResponsiveCardGridProps> = ({
  children,
  minColumnPx,
  gap,
  style,
  className,
}) => {
  const gridStyle = useResponsiveCardGridStyle({ minColumnPx, gap });

  return (
    <div className={className} style={{ ...gridStyle, ...style }}>
      {children}
    </div>
  );
};

export default ResponsiveCardGrid;
