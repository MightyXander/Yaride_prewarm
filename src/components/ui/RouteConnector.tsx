import { Icon } from '../Icons';

interface RouteConnectorProps {
  /** Цветовая градация точек: начало ярче, финиш светлее */
  variant?: 'default' | 'subtle';
}

/** Компонент-коннектор маршрута: 3 градуированные точки + стрелка вниз (старт→финиш) */
const RouteConnector: React.FC<RouteConnectorProps> = ({ variant = 'default' }) => {
  const brandColor = 'var(--brand)';
  const mutedColor = 'var(--muted-foreground)';

  const topCircleColor = variant === 'default' ? brandColor : brandColor;
  const middleCircleOpacity = variant === 'default' ? 0.6 : 0.5;
  const bottomCircleOpacity = variant === 'default' ? 0.3 : 0.25;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
      }}
      aria-hidden="true"
    >
      {/* Верхняя точка (старт) — полная насыщенность */}
      <div
        style={{
          width: '11px',
          height: '11px',
          borderRadius: '999px',
          background: topCircleColor,
          border: `2px solid ${topCircleColor}`,
          flexShrink: 0,
        }}
      />

      {/* Средняя точка — 60% прозрачности */}
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          background: topCircleColor,
          opacity: middleCircleOpacity,
          flexShrink: 0,
        }}
      />

      {/* Нижняя точка — 30% прозрачности */}
      <div
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '999px',
          background: topCircleColor,
          opacity: bottomCircleOpacity,
          flexShrink: 0,
        }}
      />

      {/* Стрелка вниз */}
      <Icon
        id="i-chev-d"
        style={{
          width: '12px',
          height: '12px',
          color: mutedColor,
          marginTop: '-1px',
        }}
      />
    </div>
  );
};

export default RouteConnector;
