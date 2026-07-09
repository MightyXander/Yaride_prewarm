import type { CSSProperties, ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT } from '../../lib/layout';

// Переиспользуемый паттерн десктоп-колонки для экранов-лент (issue #373, эпик #364,
// итер.2, по образцу ResponsiveCardGrid.tsx / issue #367). Экраны, которые в дальнейшем
// получат десктоп-полиш (формы, детали, ...) должны переиспользовать этот паттерн для
// читаемой центрированной колонки, а не изобретать свою раскладку заново.
//
// Пример использования (см. NotificationsScreen.tsx / MyAlertsScreen.tsx): оборачиваем
// основной контент (Header + список) в <ResponsiveColumn> внутри уже существующего
// scroll-контейнера экрана — сам контейнер (flex/overflow/padding) не трогаем.
//
// Правило раскладки:
// - Десктоп (>= DESKTOP_BREAKPOINT, см. lib/layout.ts): контент центрируется по
//   горизонтали и ограничивается читаемой шириной (по умолчанию 640px — комфортная
//   ширина ленты), а не растягивается на всю ширину десктоп-оболочки (1100px).
// - Мобиль/Telegram (< DESKTOP_BREAKPOINT): passthrough, без ограничения ширины (как раньше).

export interface ResponsiveColumnOptions {
  /** Максимальная ширина колонки на десктопе, px. По умолчанию 640 — читаемая ширина ленты. */
  maxWidth?: number;
}

/**
 * Хук-версия паттерна: возвращает «сырые» CSS-стили центрированной десктоп-колонки.
 * Используй, когда контент уже обёрнут в существующий контейнер (например, если нужно
 * подставить стиль напрямую в его `style`-проп, не добавляя лишний оборачивающий div).
 */
export function useResponsiveColumnStyle({ maxWidth = 640 }: ResponsiveColumnOptions = {}): CSSProperties {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);

  return isDesktop
    ? {
        width: '100%',
        maxWidth: `${maxWidth}px`,
        marginInline: 'auto',
      }
    : {};
}

interface ResponsiveColumnProps extends ResponsiveColumnOptions {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/**
 * Готовая обёртка: оборачиваешь основной контент экрана-ленты, получаешь
 * центрированную читаемую колонку на десктопе / passthrough на мобиле «из коробки».
 */
export const ResponsiveColumn: React.FC<ResponsiveColumnProps> = ({ children, maxWidth, style, className }) => {
  const columnStyle = useResponsiveColumnStyle({ maxWidth });

  return (
    <div className={className} style={{ ...columnStyle, ...style }}>
      {children}
    </div>
  );
};

export default ResponsiveColumn;
