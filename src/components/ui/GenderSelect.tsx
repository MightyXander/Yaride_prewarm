import Chip from './Chip';

/**
 * GenderSelect (issue #447, дизайн «Фича 1») — сегмент из 2 чипов для выбора пола.
 * radiogroup из значений female/male (женский первым — фича про женскую безопасность).
 * Значение 'unknown'/'' в UI не выбирается (оба чипа невыбраны) — только дефолт/приглашение.
 */
export type GenderValue = '' | 'male' | 'female' | 'unknown';

interface GenderSelectProps {
  value: GenderValue;
  onChange: (value: 'male' | 'female') => void;
  /** Подпись сверху (по умолчанию «Пол»). null — не рендерить (метка живёт снаружи). */
  label?: string | null;
  /** Пояснение под сегментом (12px muted). */
  hint?: string;
  /** Инлайн-ошибка под сегментом (--danger); до первого выбора чипы получают danger-обводку. */
  error?: string;
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const hintStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--muted-foreground)',
  lineHeight: 1.5,
  marginTop: '6px',
};

const errorStyle: React.CSSProperties = {
  fontSize: '12.5px',
  color: 'var(--danger)',
  fontWeight: 600,
  lineHeight: 1.5,
  marginTop: '6px',
};

const OPTIONS: Array<{ value: 'female' | 'male'; label: string }> = [
  { value: 'female', label: 'Женский' },
  { value: 'male', label: 'Мужской' },
];

const GenderSelect: React.FC<GenderSelectProps> = ({
  value,
  onChange,
  label = 'Пол',
  hint,
  error,
}) => {
  const hasSelection = value === 'male' || value === 'female';
  // Danger-обводка чипов показывается только при ошибке и до первого выбора.
  const errorRing = error && !hasSelection ? 'inset 0 0 0 1.5px var(--danger)' : undefined;

  return (
    <div>
      {label ? <div style={labelStyle}>{label}</div> : null}
      <div role="radiogroup" aria-label={label ?? 'Пол'} style={{ display: 'flex', gap: '10px' }}>
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={selected}
              onClick={() => onChange(opt.value)}
              role="radio"
              ariaChecked={selected}
              style={{ flex: 1, minWidth: 0, boxShadow: selected ? undefined : errorRing }}
            />
          );
        })}
      </div>
      {error ? (
        <div role="alert" aria-live="polite" style={errorStyle}>
          {error}
        </div>
      ) : hint ? (
        <div style={hintStyle}>{hint}</div>
      ) : null}
    </div>
  );
};

export default GenderSelect;
