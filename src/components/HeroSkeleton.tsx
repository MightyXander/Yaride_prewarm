import { Skeleton } from './ui/Skeleton';

/**
 * HeroSkeleton — структурный двойник <Hero>. Геометрия 1:1 с реальным hero
 * (та же рамка/градиент/тени/паддинги/высота), поэтому при появлении данных
 * Hero НЕ «прыгает» — на его месте всё это время уже стоит каркас.
 *
 * Маски на жёлтом — затемнённые (rgba(0,0,0,…)), чтобы читались на бренд-фоне.
 */
const HeroSkeleton: React.FC = () => {
  const onBrand = { background: 'rgba(0,0,0,.12)' } as const;

  return (
    <div
      className="hero-animated-border"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-xl)',
        color: 'var(--brand-foreground)',
        padding: '12px 16px',
        minHeight: '68px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-hero)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* статичный kicker — он не зависит от данных, поэтому виден сразу */}
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
              opacity: 0.65,
            }}
          >
            Сегодня по маршруту
          </div>
          <Skeleton w="76%" h={17} r={7} className="on-brand" style={onBrand} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <Skeleton w={150} h={48} r={999} className="on-brand" style={onBrand} />
          <Skeleton w={44} h={44} r={'50%'} className="on-brand" style={onBrand} />
        </div>
      </div>
    </div>
  );
};

export default HeroSkeleton;
