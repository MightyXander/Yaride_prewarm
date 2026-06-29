import { Icon } from '../Icons';

// ── Эталонная форма коннектора маршрута (единая на всех экранах) ──
// Точка-эндпоинт расположена ИНЛАЙН со своим полем/строкой (align-items:center →
// всегда по центру независимо от высоты), а между двумя эндпоинтами стоит
// мини-кластер (3 растущие точки + шеврон вниз).

interface RouteDotProps {
  /** Старт — залит брендом; финиш — только кольцо. */
  filled?: boolean;
}

/** Точка-эндпоинт маршрута: 11px, кольцо var(--brand); старт залит, финиш полый. */
export const RouteDot: React.FC<RouteDotProps> = ({ filled = false }) => (
  <span
    aria-hidden="true"
    style={{
      width: '11px',
      height: '11px',
      borderRadius: '999px',
      border: '2px solid var(--brand)',
      background: filled ? 'var(--brand)' : 'transparent',
      flexShrink: 0,
    }}
  />
);

interface RouteMidConnectorProps {
  /** CSS order (для swap направления через order на экране публикации). */
  order?: number;
}

/** Мини-коннектор между эндпоинтами: 3 растущие точки + шеврон вниз (var(--brand-dark)). */
export const RouteMidConnector: React.FC<RouteMidConnectorProps> = ({ order }) => (
  <div
    aria-hidden="true"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
      width: '11px',
      padding: '2px 0 0',
      order,
    }}
  >
    <span style={{ width: '3px', height: '3px', borderRadius: '999px', background: 'var(--muted-foreground)', opacity: 0.32 }} />
    <span style={{ width: '4px', height: '4px', borderRadius: '999px', background: 'var(--muted-foreground)', opacity: 0.55 }} />
    <span style={{ width: '5px', height: '5px', borderRadius: '999px', background: 'var(--muted-foreground)', opacity: 0.8 }} />
    <svg
      viewBox="0 0 24 24"
      style={{ width: '13px', height: '13px', marginTop: '-1px', fill: 'none', stroke: 'var(--brand-dark)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}
    >
      <path d="M7 11l5 5 5-5" />
    </svg>
  </div>
);

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
