import { useState, useMemo } from 'react';
import { Icon } from '../Icons';
import { hapticSelection } from '../../lib/haptics';

interface CalendarProps {
  /** Выбранная дата (YYYY-MM-DD), контролируется извне */
  value: string;
  /** Колбэк при выборе даты */
  onChange: (date: string) => void;
  /** Минимальная доступная дата (по умолчанию — сегодня) */
  minDate?: Date;
}

// Русские названия месяцев (именительный падеж)
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// Русские названия дней недели (короткая форма: Пн–Вс)
const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Форматирует Date в YYYY-MM-DD */
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Проверяет, одинаковые ли даты (игнорирует время) */
const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
};

/** Строит массив дней месяца с учётом padding-дней предыдущего/следующего месяца */
interface CalendarDay {
  date: Date;
  inMonth: boolean;
}

const buildMonthGrid = (year: number, month: number): CalendarDay[] => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // ISO week: понедельник = 1, воскресенье = 7
  const getISODay = (d: Date): number => {
    const day = d.getDay();
    return day === 0 ? 7 : day;
  };

  // Сколько дней предыдущего месяца показывать (чтобы начать с понедельника)
  const startWeekday = getISODay(firstDay);
  const paddingBefore = startWeekday - 1; // 0 если понедельник

  // Сколько дней следующего месяца показывать (чтобы завершить неделю)
  const endWeekday = getISODay(lastDay);
  const paddingAfter = 7 - endWeekday; // 0 если воскресенье

  const grid: CalendarDay[] = [];

  // Предыдущий месяц (padding)
  for (let i = paddingBefore; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    grid.push({ date: d, inMonth: false });
  }

  // Текущий месяц
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(year, month, day);
    grid.push({ date: d, inMonth: true });
  }

  // Следующий месяц (padding)
  for (let i = 1; i <= paddingAfter; i++) {
    const d = new Date(year, month + 1, i);
    grid.push({ date: d, inMonth: false });
  }

  return grid;
};

const Calendar: React.FC<CalendarProps> = ({ value, onChange, minDate }) => {
  const today = useMemo(() => new Date(), []);
  const min = minDate ?? today;

  // Парсим выбранную дату (YYYY-MM-DD)
  const selectedDate = useMemo(() => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [value]);

  // Состояние: текущий просматриваемый месяц (year, month)
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    hapticSelection();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    hapticSelection();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleDayClick = (day: CalendarDay) => {
    if (day.date < min) return; // Прошлое недоступно
    hapticSelection();
    onChange(formatDate(day.date));
  };

  const isToday = (date: Date) => isSameDay(date, today);
  const isSelected = (date: Date) => isSameDay(date, selectedDate);
  const isDisabled = (date: Date) => date < min;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Заголовок с навигацией */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          aria-label="Предыдущий месяц"
          onClick={handlePrevMonth}
          className="focus-ring"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--secondary)',
            color: 'var(--foreground)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon id="i-chev-l" />
        </button>

        <div
          style={{
            fontSize: '17px',
            fontWeight: 700,
            textAlign: 'center',
            flex: 1,
          }}
        >
          {MONTH_NAMES[viewMonth]} {viewYear}
        </div>

        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={handleNextMonth}
          className="focus-ring"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--secondary)',
            color: 'var(--foreground)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon id="i-chev-r" />
        </button>
      </div>

      {/* Заголовки дней недели */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
        }}
      >
        {WEEKDAY_SHORT.map((day) => (
          <div
            key={day}
            style={{
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              padding: '6px 0',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Сетка дней */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
        }}
      >
        {monthGrid.map((day, idx) => {
          const disabled = isDisabled(day.date);
          const selected = isSelected(day.date);
          const isTodayFlag = isToday(day.date);
          const outOfMonth = !day.inMonth;

          return (
            <button
              key={idx}
              type="button"
              aria-label={formatDate(day.date)}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => handleDayClick(day)}
              className="focus-ring"
              style={{
                minHeight: '44px',
                minWidth: '44px',
                borderRadius: '12px',
                border: isTodayFlag && !selected
                  ? '1.5px solid var(--brand)'
                  : '1px solid var(--border)',
                background: selected
                  ? 'var(--brand)'
                  : 'var(--secondary)',
                color: selected
                  ? 'var(--brand-foreground)'
                  : outOfMonth
                    ? 'var(--muted-foreground)'
                    : 'var(--foreground)',
                fontSize: '15px',
                fontWeight: selected ? 700 : 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-sans)',
                transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
              }}
              onPointerDown={(e) => {
                if (!disabled) {
                  e.currentTarget.style.transform = 'scale(0.94)';
                }
              }}
              onPointerUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onPointerLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {day.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Calendar;
