import { Icon } from './Icons';

interface HeroProps {
  title: React.ReactNode;
  subtitle?: string;
  ctaText?: string;
  onCtaClick?: () => void;
}

const Hero: React.FC<HeroProps> = ({ title, subtitle, ctaText, onCtaClick }) => {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-3xl)',
        background: 'var(--gradient-brand)',
        color: 'var(--brand-foreground)',
        padding: '16px 18px',
        minHeight: '126px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        border: '1px solid rgba(212, 180, 0, .22)',
        boxShadow: 'var(--shadow-hero)',
      }}
    >
      <svg
        className="art"
        viewBox="0 0 120 120"
        fill="none"
        style={{
          position: 'absolute',
          right: '-12px',
          bottom: '-12px',
          width: '142px',
          height: '142px',
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
      {subtitle && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '.18em',
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
          fontSize: '24px',
          lineHeight: 1.06,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '6px 0 0',
          position: 'relative',
        }}
      >
        {title}
      </h2>
      {ctaText && (
        <button
          onClick={onCtaClick}
          style={{
            marginTop: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            height: '38px',
            padding: '0 15px',
            borderRadius: '999px',
            background: 'var(--brand-foreground)',
            color: 'var(--background)',
            fontSize: '13px',
            fontWeight: 600,
            position: 'relative',
            width: 'fit-content',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'transform 0.08s ease, filter 0.12s ease',
            outline: 'none',
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
          onFocus={(e) => {
            e.currentTarget.style.filter = 'brightness(1.08)';
            e.currentTarget.style.outline = '2px solid var(--brand)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            e.currentTarget.style.filter = 'none';
            e.currentTarget.style.outline = 'none';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.05)';
          }}
          aria-label={`Перейти к поездке: ${ctaText}`}
        >
          <Icon id="i-clock" />
          {ctaText}
        </button>
      )}
    </div>
  );
};

export default Hero;
