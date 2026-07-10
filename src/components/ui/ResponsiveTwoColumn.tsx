import type { CSSProperties, ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT } from '../../lib/layout';

// Переиспользуемый паттерн десктоп-2-колонки: контент + липкий (sticky) aside с
// действиями/сводкой (issue #383, эпик #364, пилот-итерация для экранов «контент +
// действия сбоку» — сведения о поездке, затем профиль). Экраны с такой раскладкой
// должны переиспользовать этот паттерн, а не изобретать раскладку заново.
//
// Правило раскладки:
// - Десктоп (>= DESKTOP_BREAKPOINT, см. lib/layout.ts): CSS grid из main и aside;
//   по умолчанию (asideSide='right') — `[main minmax(0,1fr)][aside asideWidth]`,
//   при asideSide='left' — колонки меняются местами: `[aside asideWidth][main minmax(0,1fr)]`
//   (issue #387, профиль — identity-карточка слева). aside — `position: sticky`
//   у верхнего края ближайшего скролл-контейнера в обоих случаях.
// - Мобиль/Telegram (< DESKTOP_BREAKPOINT): одна колонка; по умолчанию
//   (asideSide='right') — main, затем aside (passthrough, без оборачивающих
//   стилей), порядок/поведение полностью совпадает с прежней однoколоночной
//   раскладкой (в т.ч. marginTop:'auto' внутри aside-контента для прижатия
//   действий книзу). При asideSide='left' порядок стека — aside, затем main
//   (issue #387: identity сверху, секции ниже — прежняя мобильная раскладка профиля).

export interface ResponsiveTwoColumnProps {
  /** Основной контент — колонка на десктопе (позиция зависит от asideSide), идёт первым на мобиле по умолчанию. */
  main: ReactNode;
  /** Действия/сводка — липкая колонка на десктопе, на мобиле идёт следом за main по умолчанию. */
  aside: ReactNode;
  /** Ширина aside-колонки на десктопе, px. По умолчанию 336 (см. одобренный мокап). */
  asideWidth?: number;
  /** Отступ aside от верхнего края скролл-контейнера на десктопе при sticky, px. */
  asideTop?: number;
  /** Промежуток между колонками на десктопе. */
  gap?: string;
  /**
   * Сторона aside-колонки. По умолчанию 'right' — прежнее поведение (issue #383,
   * используется TripDetailsScreen): десктоп `[main][aside]`, мобиль main→aside.
   * При 'left' (issue #387, ProfileScreen): десктоп `[aside][main]`, мобиль aside→main
   * (aside идёт первым и на десктопе, и в мобильном стеке).
   */
  asideSide?: 'left' | 'right';
  style?: CSSProperties;
  className?: string;
}

/**
 * Готовая обёртка: main + aside на десктопе — 2 колонки (aside липнет при скролле),
 * на мобиле/Telegram — одна колонка «из коробки». Сторона aside настраивается через
 * asideSide (деф. 'right' — обратно совместимо с прежним единственным поведением).
 */
export const ResponsiveTwoColumn: React.FC<ResponsiveTwoColumnProps> = ({
  main,
  aside,
  asideWidth = 336,
  asideTop = 16,
  gap = '24px',
  asideSide = 'right',
  style,
  className,
}) => {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);

  if (!isDesktop) {
    // Мобиль/Telegram: одна колонка. asideSide='right' (дефолт) — main, затем aside,
    // то же поведение и внутренние отступы, что были до введения примитива.
    // asideSide='left' — aside первым, затем main (issue #387: identity сверху).
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...style }}>
        {asideSide === 'left' ? (
          <>
            {aside}
            {main}
          </>
        ) : (
          <>
            {main}
            {aside}
          </>
        )}
      </div>
    );
  }

  const mainColumn = <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>{main}</div>;
  const asideColumn = <div style={{ position: 'sticky', top: `${asideTop}px` }}>{aside}</div>;

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: asideSide === 'left' ? `${asideWidth}px minmax(0, 1fr)` : `minmax(0, 1fr) ${asideWidth}px`,
        alignItems: 'start',
        gap,
        ...style,
      }}
    >
      {asideSide === 'left' ? (
        <>
          {asideColumn}
          {mainColumn}
        </>
      ) : (
        <>
          {mainColumn}
          {asideColumn}
        </>
      )}
    </div>
  );
};

export default ResponsiveTwoColumn;
