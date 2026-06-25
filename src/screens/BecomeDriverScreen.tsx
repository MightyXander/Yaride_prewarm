import { useId, useState } from 'react';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';

interface BecomeDriverScreenProps {
  onSubmit: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '44px',
  padding: '10px 14px',
  borderRadius: '15px',
  background: 'var(--secondary)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
};

const BecomeDriverScreen: React.FC<BecomeDriverScreenProps> = ({ onSubmit }) => {
  const [license, setLicense] = useState('9916 АВ 123456');
  const [validUntil, setValidUntil] = useState('03 / 2030');
  const [uploaded, setUploaded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const licenseId = useId();
  const validId = useId();

  const canSubmit = license.trim().length > 0 && validUntil.trim().length > 0 && uploaded && agreed;

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
      <Header title="Стать водителем" />

      <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
        Чтобы создавать поездки, подтвердите водительское удостоверение. Это разовая проверка.
      </div>

      {/* Серия и номер ВУ */}
      <div>
        <label id={licenseId} style={sectionLabelStyle as React.CSSProperties} htmlFor={`${licenseId}-input`}>
          Серия и номер ВУ
        </label>
        <input
          id={`${licenseId}-input`}
          className="focus-ring"
          inputMode="text"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          style={fieldStyle}
          placeholder="9916 АВ 123456"
        />
      </div>

      {/* Действительно до */}
      <div>
        <label id={validId} style={sectionLabelStyle as React.CSSProperties} htmlFor={`${validId}-input`}>
          Действительно до
        </label>
        <input
          id={`${validId}-input`}
          className="focus-ring"
          inputMode="numeric"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          style={fieldStyle}
          placeholder="03 / 2030"
        />
      </div>

      {/* Фото ВУ — заглушка-аплоадер */}
      <div>
        <div style={sectionLabelStyle}>Фото ВУ</div>
        <button
          type="button"
          className="focus-ring pressable"
          aria-pressed={uploaded}
          onClick={() => setUploaded((v) => !v)}
          style={{
            width: '100%',
            minHeight: '92px',
            padding: '14px',
            borderRadius: 'var(--radius)',
            border: `1.5px dashed ${uploaded ? 'var(--success)' : 'var(--border)'}`,
            background: uploaded ? 'var(--accent)' : 'var(--secondary)',
            color: uploaded ? 'var(--success)' : 'var(--foreground)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 700,
          }}
        >
          <Icon
            id={uploaded ? 'i-check' : 'i-camera'}
            style={{ width: '22px', height: '22px', strokeWidth: 2 }}
          />
          {uploaded ? 'Фото загружено · нажмите, чтобы заменить' : 'Загрузить фото удостоверения'}
        </button>
      </div>

      {/* Согласие */}
      <button
        type="button"
        role="checkbox"
        aria-checked={agreed}
        className="focus-ring pressable"
        onClick={() => setAgreed((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '11px',
          textAlign: 'left',
          minHeight: '44px',
          padding: '10px 4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          color: 'var(--foreground)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '22px',
            height: '22px',
            flexShrink: 0,
            borderRadius: '7px',
            border: `1.5px solid ${agreed ? 'var(--brand)' : 'var(--border)'}`,
            background: agreed ? 'var(--brand)' : 'transparent',
            color: 'var(--brand-foreground)',
            display: 'grid',
            placeItems: 'center',
            marginTop: '1px',
          }}
        >
          {agreed && <Icon id="i-check" style={{ width: '14px', height: '14px', strokeWidth: 2.6 }} />}
        </span>
        <span style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'var(--muted-foreground)' }}>
          Подтверждаю, что данные верны, и согласен с{' '}
          <b style={{ color: 'var(--foreground)', fontWeight: 700 }}>правилами водителя</b> и обработкой документов.
        </span>
      </button>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary" icon="i-shield" disabled={!canSubmit} onClick={onSubmit}>
          Отправить на проверку
        </Button>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Обычно проверяем за пару часов
        </div>
      </div>
    </div>
  );
};

export default BecomeDriverScreen;
