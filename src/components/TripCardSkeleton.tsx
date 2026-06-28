import Card from './ui/Card';
import { Skeleton } from './ui/Skeleton';

/**
 * TripCardSkeleton — структурный двойник <TripCard>.
 * Та же оболочка Card (radius-xl, padding 16, border, shadow-card) и та же
 * слот-сетка `auto 1fr auto`, что и в реальной карточке, поэтому переход
 * скелетон → данные идёт без сдвига (0 CLS).
 *
 * Раньше тут были серые блоки на `var(--muted)` (переменная не была
 * определена → плейсхолдеры были прозрачными). Теперь — shimmer на
 * `var(--skel-base)` (см. index.css).
 */
interface TripCardSkeletonProps {
  count?: number;
}

const TripCardSkeleton: React.FC<TripCardSkeletonProps> = ({ count = 3 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} style={{ cursor: 'default' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '11px', alignItems: 'flex-start' }}>
            {/* avatar */}
            <Skeleton w={46} h={46} r={14} />
            {/* middle */}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '2px' }}>
              <Skeleton w={'62%'} h={16} r={6} />
              <Skeleton w={'82%'} h={14} r={6} />
              <Skeleton w={'46%'} h={14} r={6} />
            </div>
            {/* right column */}
            <div style={{ flexShrink: 0, width: '58px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <Skeleton w={42} h={20} r={6} />
              <Skeleton w={56} h={30} r={14} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default TripCardSkeleton;
