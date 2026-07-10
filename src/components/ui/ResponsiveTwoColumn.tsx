import type { CSSProperties, ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT } from '../../lib/layout';

// Переиспользуемый паттерн десктоп-2-колонки: контент + липкий (sticky) aside с
// действиями/сводкой (issue #383, эпик #364, пилот-итерация для экранов «контент +
// действия сбоку» — сведения о поездке, затем профиль). Экраны с такой раскладкой
// должны переиспользовать этот паттерн, а не изобретать раскладку заново.
//
// Правило раскладки:
// - Десктоп (>= DESKTOP_BREAKPOINT, см. lib/layout.ts): CSS grid
//   `[main minmax(0,1fr)][aside asideWidth]`, aside — `position: sticky` у
//   верхнего края ближайшего скролл-контейнера.
// - Мобиль/Telegram (< DESKTOP_BREAKPOINT): одна колонка — main, затем aside
//   (passthrough, без оборачивающих стилей), порядок/поведение полностью
//   совпадает с прежней однoколоночной раскладкой (в т.ч. marginTop:'auto'
//   внутри aside-контента для прижатия действий книзу).

export interface ResponsiveTwoColumnProps {
  /** Основной контент — левая колонка на десктопе, идёт первым на мобиле. */
  main: ReactNode;
  /** Действия/сводка — правая липкая колонка на десктопе, на мобиле идёт следом за main. */
  aside: ReactNode;
  /** Ширина aside-колонки на десктопе, px. По умолчанию 336 (см. одобренный мокап). */
  asideWidth?: number;
  /** Отступ aside от верхнего края скролл-контейнера на десктопе при sticky, px. */
  asideTop?: number;
  /** Промежуток между колонками на десктопе. */
  gap?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Готовая обёртка: main + aside на десктопе — 2 колонки (aside липнет при скролле),
 * на мобиле/Telegram — одна колонка (main, затем aside) «из коробки».
 */
export const ResponsiveTwoColumn: React.FC<ResponsiveTwoColumnProps> = ({
  main,
  aside,
  asideWidth = 336,
  asideTop = 16,
  gap = '24px',
  style,
  className,
}) => {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);

  if (!isDesktop) {
    // Мобиль/Telegram: одна колонка, main и aside в исходном порядке — то же
    // поведение и внутренние отступы, что были до введения примитива.
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...style }}>
        {main}
        {aside}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `minmax(0, 1fr) ${asideWidth}px`,
        alignItems: 'start',
        gap,
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>{main}</div>
      <div style={{ position: 'sticky', top: `${asideTop}px` }}>{aside}</div>
    </div>
  );
};

export default ResponsiveTwoColumn;
