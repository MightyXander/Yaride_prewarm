import React from 'react';
import { Icon } from './Icons';

interface PhoneLinkProps {
  /** Телефон контрагента в формате +7XXXXXXXXXX (раскрывается только после брони). */
  phone: string;
  /** Имя контрагента — для доступной подписи tel-ссылки. */
  name?: string;
}

/**
 * Тап-ссылка `tel:` на телефон контрагента (issue #267).
 * Показывается ТОЛЬКО когда номер раскрыт бэкендом (активная бронь): пассажиру —
 * телефон водителя, водителю — телефон пассажира. Стиль — спокойный чип в духе
 * бэйджа госномера; тач-таргет ≥44px, явная иконка (не только цвет).
 */
const PhoneLink: React.FC<PhoneLinkProps> = ({ phone, name }) => {
  // Для подписи показываем человекочитаемый номер; в href — без пробелов.
  const href = `tel:${phone.replace(/\s/g, '')}`;
  return (
    <a
      href={href}
      className="focus-ring pressable"
      aria-label={name ? `Позвонить: ${name}, ${phone}` : `Позвонить: ${phone}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        minHeight: '30px',
        padding: '4px 10px',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        background: 'color-mix(in srgb, var(--foreground) 5%, var(--card))',
        color: 'var(--foreground)',
        fontWeight: 700,
        fontSize: '13px',
        letterSpacing: '0.01em',
        fontVariantNumeric: 'tabular-nums',
        textDecoration: 'none',
        verticalAlign: 'middle',
      }}
    >
      <Icon id="i-phone" style={{ width: '13px', height: '13px', color: 'var(--brand)' }} />
      {phone}
    </a>
  );
};

export default PhoneLink;
