import { useState } from 'react';
import Header from '../components/Header';
import Button from '../components/ui/Button';
import { addCar, ApiException } from '../lib/api';
import { showToast } from '../lib/toast';
import { hapticSelection } from '../lib/haptics';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';

interface AddCarScreenProps {
  /** Машина сохранена — обычно возврат на предыдущий экран. */
  onSaved?: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '50px',
  padding: '0 16px',
  borderRadius: '18px',
  background: 'var(--field)',
  border: '1px solid var(--field-border)',
  boxShadow: 'var(--field-shadow)',
  color: 'var(--foreground)',
  fontSize: '16px',
  fontWeight: 600,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  boxSizing: 'border-box',
};

// Список цветов для чипов
const COLOR_OPTIONS = [
  'белый',
  'чёрный',
  'серый',
  'серебристый',
  'синий',
  'красный',
  'зелёный',
  'коричневый',
];

// Допустимые буквы для российских номеров (кириллица)
const ALLOWED_LETTERS = 'АВЕКМНОРСТУХ';

/**
 * Форматирование гос. номера: А123ВС (буква + 3 цифры + 2 буквы).
 * Максимум 6 символов, верхний регистр.
 */
function formatPlate(raw: string): string {
  const upper = raw.toUpperCase();
  let result = '';

  for (const char of upper) {
    const isDigit = char >= '0' && char <= '9';
    const isAllowedLetter = ALLOWED_LETTERS.includes(char);

    if (result.length === 0) {
      // Позиция 0: только буква
      if (isAllowedLetter) result += char;
    } else if (result.length >= 1 && result.length <= 3) {
      // Позиции 1-3: только цифры
      if (isDigit) result += char;
    } else if (result.length >= 4 && result.length <= 5) {
      // Позиции 4-5: только буквы
      if (isAllowedLetter) result += char;
    }

    if (result.length >= 6) break;
  }

  return result;
}

/**
 * AddCarScreen — добавить машину водителя (модель/цвет/номер).
 * Функциональный минимум: воркер доводит до эталона (цвет — чипы, автоформат номера, layout).
 */
const AddCarScreen: React.FC<AddCarScreenProps> = ({ onSaved }) => {
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = model.trim() !== '';

  const handleSave = async () => {
    if (!canSave || saving) return;
    try {
      setSaving(true);
      await addCar({
        model: model.trim(),
        color: color.trim() || null,
        plate: plate.trim() || null,
      });
      showToast('Машина добавлена');
      onSaved?.();
    } catch (err) {
      showToast(err instanceof ApiException ? err.message : 'Не удалось добавить машину');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px',
        paddingBottom: FLOATING_NAV_SCROLL_CLEARANCE,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <Header title="Добавить машину" />

      <div>
        <div style={labelStyle}>Модель</div>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Напр. Kia Rio"
          className="focus-ring"
          style={fieldStyle}
        />
      </div>

      <div>
        <div style={labelStyle}>Цвет</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {COLOR_OPTIONS.map((label) => {
            const isSelected = color === label;
            const shouldReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

            return (
              <button
                key={label}
                type="button"
                aria-pressed={isSelected}
                className="focus-ring pressable"
                onClick={() => {
                  setColor(label);
                  hapticSelection();
                }}
                style={{
                  minHeight: '42px',
                  padding: '6px 15px',
                  borderRadius: '999px',
                  fontSize: '14.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-sans)',
                  transition: shouldReduceMotion ? 'none' : 'all 0.15s ease-in-out',
                  ...(isSelected
                    ? {
                        border: 'none',
                        background: 'var(--gradient-brand)',
                        color: 'var(--brand-foreground)',
                        boxShadow: 'var(--shadow-hero)',
                      }
                    : {
                        border: '1px solid var(--field-border)',
                        background: 'var(--field)',
                        color: 'var(--secondary-foreground)',
                        boxShadow: 'var(--field-shadow)',
                      }),
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={labelStyle}>Гос. номер</div>
        <input
          value={plate}
          onChange={(e) => setPlate(formatPlate(e.target.value))}
          placeholder="А123ВС"
          className="focus-ring"
          style={{ ...fieldStyle, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
        />
        <div style={{ fontSize: '12.5px', color: 'var(--muted-foreground)', marginTop: '8px' }}>
          Без региона — только серия и номер.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: 'auto', paddingTop: '6px' }}>
        <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? 'Сохраняем…' : 'Сохранить машину'}
        </Button>
      </div>
    </div>
  );
};

export default AddCarScreen;
