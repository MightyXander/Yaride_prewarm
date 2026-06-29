import { Icon } from './Icons';

interface HeroProps {
  title: React.ReactNode;
  subtitle?: string;
  ctaText?: string;
  onCtaClick?: () => void;
  onToggleDirection?: () => void;
  onPublish?: () => void;
  showPublish?: boolean;
}

const Hero: React.FC<HeroProps> = ({ title, subtitle, ctaText, onCtaClick, onToggleDirection, onPublish, showPublish = false }) => {
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
      {/* Мягкое статичное свечение (radial-gradient) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(120% 130% at 84% -22%, rgba(255,255,255,.5), rgba(255,255,255,0) 54%)',
        }}
      />
      {/* Статичные радар-кольца (мотив локации "вы здесь"), БЕЗ анимации */}
      <svg
        viewBox="0 0 360 124"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <g fill="none" strokeWidth="2.4">
          <circle cx="330" cy="60" r="29" stroke="rgba(24,23,15,.17)" />
          <circle cx="330" cy="60" r="52" stroke="rgba(24,23,15,.115)" />
          <circle cx="330" cy="60" r="77" stroke="rgba(24,23,15,.075)" />
          <circle cx="330" cy="60" r="104" stroke="rgba(24,23,15,.045)" />
        </g>
        <circle cx="330" cy="60" r="6" fill="rgba(24,23,15,.22)" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
        <div style={{ minWidth: 0 }}>
          {subtitle && (
            <div
              style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                opacity: 0.62,
              }}
            >
              {subtitle}
            </div>
          )}
          <h2
            style={{
              fontSize: '22px',
              lineHeight: 1.14,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '5px 0 0',
              maxWidth: '11.5em',
            }}
          >
            {title}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {ctaText && (
            <button
              onClick={onCtaClick}
              className="focus-ring pressable"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                width: '100%',
                height: '48px',
                padding: '0 18px',
                borderRadius: '999px',
                background: 'var(--brand-foreground)',
                color: '#f5f5f7',
                fontSize: '15px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                whiteSpace: 'nowrap',
                flex: '1 1 auto',
                minWidth: 0,
              }}
              aria-label={`Перейти к поездке: ${ctaText}`}
            >
              <Icon id="i-clock" />
              {ctaText}
            </button>
          )}
          {onToggleDirection && (
            <button
              aria-label="Сменить направление"
              onClick={onToggleDirection}
              className="focus-ring pressable"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--brand-foreground)',
                display: 'grid',
                placeItems: 'center',
                color: '#f5f5f7',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 4v16M7 4L4 7m3-3l3 3M17 20V4m0 16l3-3m-3 3l-3-3" />
              </svg>
            </button>
          )}
          {onPublish && showPublish && (
            <button
              aria-label="Создать поездку"
              onClick={onPublish}
              className="focus-ring pressable"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--brand-foreground)',
                display: 'grid',
                placeItems: 'center',
                color: '#f5f5f7',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Icon id="i-plus" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Hero;
