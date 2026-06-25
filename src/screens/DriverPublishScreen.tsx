import { useId, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Header from '../components/Header';
import { hapticSelection } from '../lib/haptics';
import type { SelectOption } from '../components/ui/Select';

interface DriverPublishScreenProps {
  onPublish: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const TIME_OPTIONS = ['7:30', '7:40', '7:55', '8:10', 'другое'];
const MIN_SEATS = 1;
const MAX_SEATS = 4;

const PICKUP_OPTIONS: SelectOption[] = [
  { value: 'uritskogo', label: 'ул. Урицкого, 12' },
  { value: 'dzerzhinskogo', label: 'пр-т Дзержинского, 8' },
  { value: 'svobody', label: 'ул. Свободы, 60' },
  { value: 'leningradsky', label: 'Ленинградский пр-т, 40' },
];

interface SelectableChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const SelectableChip: React.FC<SelectableChipProps> = ({ label, active, onClick }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={() => {
      if (!active) hapticSelection();
      onClick();
    }}
    className="focus-ring pressable"
    style={{
      minHeight: '44px',
      padding: '6px 14px',
      borderRadius: '999px',
      fontSize: '13px',
      fontWeight: 700,
      fontFamily: 'var(--font-sans)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
      background: active ? 'var(--brand)' : 'var(--secondary)',
      color: active ? 'var(--brand-foreground)' : 'var(--secondary-foreground)',
    }}
  >
    {label}
  </button>
);

const DriverPublishScreen: React.FC<DriverPublishScreenProps> = ({ onPublish }) => {
  const [time, setTime] = useState<string>('7:40');
  const [seats, setSeats] = useState<number>(2);
  const [pickup, setPickup] = useState<string>('uritskogo');
  const timeLabelId = useId();
  const seatsLabelId = useId();

  const stepBtnStyle = (enabled: boolean): React.CSSProperties => ({
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--secondary)',
    color: 'var(--foreground)',
    display: 'grid',
    placeItems: 'center',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.45,
    fontFamily: 'var(--font-sans)',
  });

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Header title="Я за рулём" />

      {/* Маршрут из шаблона */}
      <Card>
        <div style={sectionLabelStyle}>Маршрут · из шаблона</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '13px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <span
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                background: 'var(--brand)',
                flexShrink: 0,
              }}
            />
            Брагино, ул. Урицкого, 12
          </div>
          <div
            style={{
              height: '16px',
              borderLeft: '2px dotted var(--muted-foreground)',
              marginLeft: '4.5px',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '13px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <span
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                flexShrink: 0,
              }}
            />
            Центр, пл. Волкова
          </div>
        </div>
      </Card>

      {/* Время — чипами */}
      <div role="group" aria-labelledby={timeLabelId}>
        <div id={timeLabelId} style={sectionLabelStyle}>Когда выезжаешь?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {TIME_OPTIONS.map((t) => (
            <SelectableChip key={t} label={t} active={time === t} onClick={() => setTime(t)} />
          ))}
        </div>
      </div>

      {/* Число мест — степпер */}
      <div role="group" aria-labelledby={seatsLabelId}>
        <div id={seatsLabelId} style={sectionLabelStyle}>Сколько возьмёшь?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            aria-label="Меньше мест"
            className="focus-ring pressable"
            disabled={seats <= MIN_SEATS}
            onClick={() => {
              hapticSelection();
              setSeats((s) => Math.max(MIN_SEATS, s - 1));
            }}
            style={stepBtnStyle(seats > MIN_SEATS)}
          >
            <span style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1 }}>−</span>
          </button>
          <div
            aria-live="polite"
            style={{
              minWidth: '64px',
              textAlign: 'center',
              fontSize: '17px',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {seats} {seats === 1 ? 'место' : seats < 5 ? 'места' : 'мест'}
          </div>
          <button
            type="button"
            aria-label="Больше мест"
            className="focus-ring pressable"
            disabled={seats >= MAX_SEATS}
            onClick={() => {
              hapticSelection();
              setSeats((s) => Math.min(MAX_SEATS, s + 1));
            }}
            style={stepBtnStyle(seats < MAX_SEATS)}
          >
            <span style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1 }}>+</span>
          </button>
        </div>
      </div>

      {/* Точка сбора — Select */}
      <div>
        <Select
          options={PICKUP_OPTIONS}
          value={pickup}
          onChange={setPickup}
          label="Точка сбора"
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary" icon="i-car" onClick={onPublish}>
          Опубликовать поездку
        </Button>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Пассажиры увидят поездку и смогут забронировать место
        </div>
      </div>
    </div>
  );
};

export default DriverPublishScreen;
