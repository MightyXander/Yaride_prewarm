import { Icon } from './Icons';

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Слот справа (например, кнопка). Если не задан — рендерится пустой спейсер для центрирования. */
  right?: React.ReactNode;
  /** Иконка справа (альтернатива right, удобный шорткат для icon-кнопки). */
  rightIcon?: string;
  /** Обработчик клика по rightIcon. */
  onRightClick?: () => void;
}

/**
 * Единая шапка экрана: спейсер слева / заголовок (опц. подзаголовок) по центру /
 * right-слот или симметричный спейсер справа. Заменяет инлайн-копии в экранах.
 */
const Header: React.FC<HeaderProps> = ({ title, subtitle, right, rightIcon, onRightClick }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 2px',
        gap: '8px',
      }}
    >
      <div style={{ width: '32px', flexShrink: 0 }} />
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: '14px',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--muted-foreground)',
              marginTop: '1px',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {rightIcon ? (
        <button
          type="button"
          onClick={onRightClick}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '11px',
            background: 'var(--secondary)',
            border: 'none',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            color: 'var(--foreground)',
            flexShrink: 0,
            transition: 'transform 0.08s ease, filter 0.12s ease',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.92)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <Icon id={rightIcon} style={{ width: '18px', height: '18px' }} />
        </button>
      ) : (
        right ?? <div style={{ width: '32px', flexShrink: 0 }} />
      )}
    </div>
  );
};

export default Header;
