import { useState } from 'react';
import Header from '../components/Header';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import type { SelectOption } from '../components/ui/Select';
import { addCar, ApiException } from '../lib/api';
import { showToast } from '../lib/toast';
import { hapticSelection } from '../lib/haptics';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { ResponsiveColumn } from '../components/ui/ResponsiveColumn';
import { getScreenData, setScreenData } from '../lib/screenDataCache';
import type { Car } from '../types/api';

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

// Список цветов
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

const COLOR_SELECT_OPTIONS: SelectOption[] = COLOR_OPTIONS.map((label) => ({
  value: label,
  label,
}));

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
 * Функциональный минимум: воркер доводит до эталона (автоформат номера, layout).
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
      const res = await addCar({
        model: model.trim(),
        color: color.trim() || null,
        plate: plate.trim() || null,
      });
      // Обновляем кэш «Моих машин» (issue #352): если экран уже прогрет
      // (префетч из ProfileScreen/предыдущий заход), возврат назад должен
      // сразу показать новую машину, а не протухший список из кэша.
      const cachedCars = getScreenData<Car[]>('my-cars');
      if (cachedCars !== undefined) {
        setScreenData<Car[]>('my-cars', [...cachedCars, res.car]);
      }
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
      {/* Десктоп (>=900px): центрированная читаемая колонка ~520px вместо растяжения
          на всю ширину десктоп-оболочки; мобиль/Telegram — passthrough (issue #375, эпик #364). */}
      <ResponsiveColumn maxWidth={520} style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
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
        <Select
          variant="field"
          options={COLOR_SELECT_OPTIONS}
          value={color}
          onChange={(value) => {
            setColor(value);
            hapticSelection();
          }}
          placeholder="Выбрать цвет"
          aria-label="Цвет"
        />
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
      </ResponsiveColumn>
    </div>
  );
};

export default AddCarScreen;
