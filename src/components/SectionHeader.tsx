import { Icon } from './Icons';

interface SectionHeaderProps {
  title: string;
  /** Счётчик поездок в секции — pill справа. */
  count: number;
  /**
   * 'female' — акцентный заголовок «Женские поездки»: иконка i-shield в --brand-dark,
   * текст --foreground. 'muted' — приглушённый заголовок «Остальные — с мужчинами».
   */
  variant?: 'female' | 'muted';
  /** Первый заголовок в списке — без верхнего отступа (list padding уже есть). */
  first?: boolean;
}

/**
 * Лёгкий подзаголовок-разделитель в потоке списка поездок (дизайн women-ride 2.2).
 * Не карточка — плоский заголовок секции с иконкой (для женских) и счётчиком-pill.
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({ title, count, variant = 'muted', first = false }) => {
  const isFemale = variant === 'female';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: `${first ? 0 : 14}px 4px 8px`,
      }}
    >
      {isFemale && (
        <Icon
          id="i-shield"
          style={{ width: '15px', height: '15px', color: 'var(--brand-dark)', flexShrink: 0 }}
        />
      )}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 800,
          letterSpacing: '.01em',
          color: isFemale ? 'var(--foreground)' : 'var(--muted-foreground)',
        }}
      >
        {title}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: '19px',
          padding: '0 7px',
          borderRadius: '999px',
          background: 'var(--secondary)',
          color: 'var(--secondary-foreground)',
          fontWeight: 700,
          fontSize: '12px',
          fontVariantNumeric: 'tabular-nums',
          marginLeft: 'auto',
          flexShrink: 0,
        }}
      >
        {count}
      </span>
    </div>
  );
};

export default SectionHeader;
