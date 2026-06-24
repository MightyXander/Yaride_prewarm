export const Icons = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <symbol id="i-search" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </symbol>
    <symbol id="i-car" viewBox="0 0 24 24">
      <path d="M5 11l1.7-4.3A2 2 0 0 1 8.6 5.4h6.8a2 2 0 0 1 1.9 1.3L19 11" />
      <rect x="3" y="11" width="18" height="6" rx="2.2" />
      <circle cx="7.5" cy="17.5" r="1.4" />
      <circle cx="16.5" cy="17.5" r="1.4" />
    </symbol>
    <symbol id="i-clock" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.3l3 1.7" />
    </symbol>
    <symbol id="i-star" viewBox="0 0 24 24">
      <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.7 6.7 19.5l1.1-5.9L3.4 9.5l6-.8z" />
    </symbol>
    <symbol id="i-sliders" viewBox="0 0 24 24">
      <path d="M4 7h9M17.5 7H20M4 17h2.5M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="8.5" cy="17" r="2.2" />
    </symbol>
  </svg>
);

interface IconProps {
  id: string;
  className?: string;
  fill?: boolean;
  style?: React.CSSProperties;
}

export const Icon: React.FC<IconProps> = ({ id, className = '', fill = false, style }) => (
  <svg
    className={`ic ${fill ? 'fill' : ''} ${className}`.trim()}
    style={{
      width: '1.05em',
      height: '1.05em',
      verticalAlign: '-2px',
      fill: fill ? 'currentColor' : 'none',
      stroke: fill ? 'none' : 'currentColor',
      strokeWidth: 1.9,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      flexShrink: 0,
      display: 'inline-block',
      ...style,
    }}
  >
    <use href={`#${id}`} />
  </svg>
);
