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
      <svg
        className="art"
        viewBox="0 0 120 120"
        fill="none"
        style={{
          position: 'absolute',
          right: '-8px',
          bottom: '-8px',
          width: '90px',
          height: '90px',
          color: 'rgba(0, 0, 0, .14)',
          pointerEvents: 'none',
          strokeWidth: 2,
        }}
      >
        <path
          d="M10 80 Q40 50 60 70 T110 50"
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray="4 6"
        />
        <circle cx="60" cy="70" r="3" fill="currentColor" />
        <circle cx="98" cy="56" r="14" stroke="currentColor" />
        <path d="M108 66 L116 74" stroke="currentColor" strokeLinecap="round" />
      </svg>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          {subtitle && (
            <div
              style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                opacity: 0.65,
                position: 'relative',
              }}
            >
              {subtitle}
            </div>
          )}
          <h2
            style={{
              fontSize: '17px',
              lineHeight: 1.2,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              margin: '3px 0 0',
              position: 'relative',
            }}
          >
            {title}
          </h2>
        </div>
        {ctaText && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '8px',
            }}
          >
            <button
              onClick={onCtaClick}
              className="focus-ring pressable"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '48px',
                padding: '0 16px',
                borderRadius: '999px',
                background: 'var(--brand-foreground)',
                color: '#f5f5f7',
                fontSize: '15px',
                fontWeight: 600,
                position: 'relative',
                width: 'fit-content',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'transform 0.08s ease, filter 0.12s ease',
                flexShrink: 0,
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.97)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.05)';
              }}
              aria-label={`Перейти к поездке: ${ctaText}`}
            >
              <Icon id="i-clock" />
              {ctaText}
            </button>
            {(onToggleDirection || (onPublish && showPublish)) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative',
                }}
              >
                {onToggleDirection && (
                  <button
                    aria-label="Сменить направление"
                    onClick={onToggleDirection}
                    className="focus-ring pressable"
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'var(--brand-foreground)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#f5f5f7',
                      fontSize: '18px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      transition: 'transform 0.08s ease, filter 0.12s ease',
                      padding: 0,
                      flexShrink: 0,
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = 'scale(0.97)';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = 'brightness(1.05)';
                    }}
                  >
                    ⇄
                  </button>
                )}
                {onPublish && showPublish && (
                  <button
                    aria-label="Создать поездку"
                    onClick={onPublish}
                    className="focus-ring pressable"
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'var(--brand-foreground)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#f5f5f7',
                      fontSize: '20px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      transition: 'transform 0.08s ease, filter 0.12s ease',
                      padding: 0,
                      flexShrink: 0,
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = 'scale(0.97)';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = 'brightness(1.05)';
                    }}
                  >
                    <Icon id="i-plus" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Hero;
