import Chip from './ui/Chip';
import { localDateStr } from '../lib/dateLocal';

interface TopbarProps {
  title: string;
  subtitle?: string;
  /** Выбранная дата поиска ('YYYY-MM-DD'); включает переключатель Сегодня/Завтра. */
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
}

// Компактный стиль Chip для шапки: не переполнять узкий экран (360px).
const DATE_CHIP_STYLE: React.CSSProperties = {
  height: '40px',
  minWidth: 'auto',
  padding: '0 6px',
  fontSize: '13px',
  borderRadius: '12px',
};

const Topbar: React.FC<TopbarProps> = ({ title, subtitle, selectedDate, onSelectDate }) => {
  const today = localDateStr();
  const tomorrow = localDateStr(new Date(Date.now() + 86_400_000));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        gap: '8px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: '17px',
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '15px',
              color: 'var(--muted-foreground)',
              marginTop: '2px',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {onSelectDate && (
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <Chip
            label="Сегодня"
            selected={selectedDate === today}
            onClick={() => onSelectDate(today)}
            style={DATE_CHIP_STYLE}
          />
          <Chip
            label="Завтра"
            selected={selectedDate === tomorrow}
            onClick={() => onSelectDate(tomorrow)}
            style={DATE_CHIP_STYLE}
          />
        </div>
      )}
    </div>
  );
};

export default Topbar;
