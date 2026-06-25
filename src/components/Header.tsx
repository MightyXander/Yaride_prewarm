interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Слот справа (например, кнопка). Если не задан — рендерится пустой спейсер для центрирования. */
  right?: React.ReactNode;
}

/**
 * Единая шапка экрана: спейсер слева / заголовок (опц. подзаголовок) по центру /
 * right-слот или симметричный спейсер справа. Заменяет инлайн-копии в экранах.
 */
const Header: React.FC<HeaderProps> = ({ title, subtitle, right }) => {
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
      {right ?? <div style={{ width: '32px', flexShrink: 0 }} />}
    </div>
  );
};

export default Header;
