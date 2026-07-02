import { Skeleton } from './ui/Skeleton';

/**
 * ScreenSkeleton — общий лёгкий каркас экрана для `<Suspense fallback>` (issue #238/#306).
 * Раньше fallback был `null` — во время загрузки чанка ленивого экрана
 * (см. `src/lib/screenRegistry.tsx`) рендерился буквально пустой DOM, из-за
 * чего между кликом и появлением контента был заметен белый экран.
 *
 * Компонент экран-агностичный (Suspense в App.tsx оборачивает ЛЮБОЙ ленивый
 * экран, не знает, какой именно грузится) — поэтому геометрия условная:
 * заголовок по центру (как Header) + пара блоков-карточек (как типовые
 * списки/карточки экранов). Задача — не 1:1 совпадение с реальным экраном,
 * а не дать пустому DOM промелькнуть белой вспышкой.
 */
const ScreenSkeleton: React.FC = () => (
  <div
    aria-hidden="true"
    style={{
      flex: 1,
      overflow: 'hidden',
      padding: '6px 16px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}
  >
    {/* Заголовок, как Header: спейсер / центр / спейсер */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 2px' }}>
      <Skeleton w="46%" h={18} r={6} />
    </div>

    {/* Блоки-карточки — общий каркас, без привязки к конкретному экрану */}
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          background: 'var(--elevated)',
          borderRadius: 'var(--radius-xl)',
          padding: '16px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <Skeleton w="62%" h={16} r={6} />
        <Skeleton w="88%" h={14} r={6} />
        <Skeleton w="40%" h={14} r={6} />
      </div>
    ))}
  </div>
);

export default ScreenSkeleton;
