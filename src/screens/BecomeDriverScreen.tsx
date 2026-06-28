import { useId, useState } from 'react';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { submitLicense } from '../lib/api';
import { showToast } from '../lib/toast';

interface BecomeDriverScreenProps {
  onSubmit: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
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

/**
 * Форматирует номер ВУ: NNNN ЛЛ NNNNNN (4 цифры, пробел, 2 буквы рус, пробел, 6 цифр).
 * Автоматически расставляет пробелы, конвертирует буквы в ВЕРХНИЙ регистр.
 */
function formatLicenseNumber(input: string): string {
  // Убираем все символы кроме цифр и русских букв
  const cleaned = input.replace(/[^0-9А-Яа-я]/g, '').toUpperCase();

  let formatted = '';
  let digitCount = 0;
  let letterCount = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const isDigit = /[0-9]/.test(char);
    const isLetter = /[А-Я]/.test(char);

    // Первые 4 символа — только цифры
    if (formatted.length < 4) {
      if (isDigit) {
        formatted += char;
        digitCount++;
      }
      if (formatted.length === 4) formatted += ' ';
    }
    // Символы 5-6 (после первого пробела) — только буквы
    else if (formatted.length < 7) {
      if (isLetter) {
        formatted += char;
        letterCount++;
      }
      if (formatted.length === 7) formatted += ' ';
    }
    // Последние 6 символов — только цифры
    else if (formatted.length < 15) {
      if (isDigit) {
        formatted += char;
      }
    }
  }

  return formatted;
}

/**
 * Форматирует дату действия: MM / YYYY (автоматически расставляет разделитель).
 * Валидирует месяц (01-12).
 */
function formatValidUntilDate(input: string): string {
  // Убираем всё кроме цифр
  const cleaned = input.replace(/[^0-9]/g, '');

  let formatted = '';

  for (let i = 0; i < cleaned.length && formatted.length < 9; i++) {
    const char = cleaned[i];

    // Первые 2 символа — месяц (MM)
    if (formatted.length < 2) {
      formatted += char;
      // Мягкая валидация: если первая цифра > 1, автоматом дополняем до 0X
      if (formatted.length === 1 && parseInt(char) > 1) {
        formatted = '0' + formatted;
      }
      // После двух цифр добавляем разделитель
      if (formatted.length === 2) {
        // Валидация месяца 01-12
        const month = parseInt(formatted);
        if (month < 1) formatted = '01';
        if (month > 12) formatted = '12';
        formatted += ' / ';
      }
    }
    // Следующие 4 символа — год (YYYY)
    else if (formatted.length < 9) {
      formatted += char;
    }
  }

  return formatted;
}

const BecomeDriverScreen: React.FC<BecomeDriverScreenProps> = ({ onSubmit }) => {
  const [license, setLicense] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const licenseId = useId();
  const validId = useId();

  const handleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseNumber(e.target.value);
    setLicense(formatted);
  };

  const handleValidUntilChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatValidUntilDate(e.target.value);
    setValidUntil(formatted);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Собрать seriesNumber из license (уже отформатирован в UI)
      // validUntil нужно преобразовать из "MM / YYYY" в "MM/YYYY"
      const seriesNumber = license.trim();
      const normalizedValidUntil = validUntil.replace(/\s+/g, '');

      await submitLicense({
        seriesNumber,
        validUntil: normalizedValidUntil,
      });

      // Успех — navigate в license-review
      onSubmit();
    } catch (err) {
      // Показать тост с ошибкой
      const message = err instanceof Error ? err.message : 'Не удалось отправить заявку';
      showToast(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = license.trim().length > 0 && validUntil.trim().length > 0 && uploaded && agreed && !isSubmitting;

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

      <div style={{ fontSize: '15px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
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
          onChange={handleLicenseChange}
          style={fieldStyle}
          placeholder="9916 АВ 123456"
          maxLength={15}
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
          onChange={handleValidUntilChange}
          style={fieldStyle}
          placeholder="03 / 2030"
          maxLength={9}
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
            fontSize: '15px',
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
        <Button variant="primary" icon="i-shield" disabled={!canSubmit} onClick={handleSubmit}>
          {isSubmitting ? 'Отправка...' : 'Отправить на проверку'}
        </Button>
        <div
          style={{
            fontSize: '12px',
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
