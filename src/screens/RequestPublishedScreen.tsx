import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { hapticImpact, hapticNotify } from '../lib/haptics';
import { buildAlertDeepLink, shareToTelegram } from '../lib/share';

// Экран 20 SPEC: Заявка опубликована
// Успех-стейт после публикации заявки пассажира. Показываем что ищем + действия.

// Отображаемые детали заявки (пока статичные — экран ещё не принимает реальные
// данные маршрута/времени как props, см. TODO в SPEC). Вынесены в константы,
// чтобы текст шеринга не разъезжался с тем, что видно на экране.
const FROM_LABEL = 'Брагино, ул. Урицкого, 12';
const TO_LABEL = 'Центр, пл. Волкова';
const DESIRED_TIME = '8:30';
const SEATS_LABEL = '1 пассажир';

interface RequestPublishedScreenProps {
  onEdit?: () => void;
  // Может быть синхронным (просто навигация) или асинхронным (сетевой вызов) —
  // обработчик ниже одинаково безопасен в обоих случаях.
  onCancel?: () => void | Promise<void>;
  // id заявки (ответ POST /api/alerts), доходит через общий слот навигации
  // publishedTripId (issue #319/#321) — нужен для deep-link в шеринге.
  alertId?: number | null;
}

const RequestPublishedScreen: React.FC<RequestPublishedScreenProps> = ({ onEdit, onCancel, alertId }) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleShare = () => {
    hapticImpact('light');
    const text =
      `Ищу попутку: ${FROM_LABEL} → ${TO_LABEL}, к ${DESIRED_TIME}. ` +
      `Если едешь этим маршрутом — откликнись в Yaride:`;
    shareToTelegram(text, buildAlertDeepLink(alertId));
  };

  const handleCancel = async () => {
    // Защита от гонки: повторный тап, пока первая отмена ещё в полёте, не должен
    // повторно триггерить навигацию/запрос и рендерить экран поверх удалённой заявки.
    if (isCancelling) return;

    hapticImpact('light');
    setCancelError(null);
    setIsCancelling(true);
    try {
      await onCancel?.();
      // При успехе вызывающая сторона уводит нас с этого экрана навигацией —
      // сбрасывать isCancelling не нужно, компонент вот-вот размонтируется.
    } catch (err) {
      console.error('Ошибка отмены заявки:', err);
      setCancelError('Не удалось отменить заявку. Попробуй ещё раз.');
      setIsCancelling(false);
      hapticNotify('error');
    }
  };

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
      <Header title="Заявка" />

      {/* Успех-иконка */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          padding: '34px 0 8px',
        }}
      >
        <div
          style={{
            width: '88px',
            height: '88px',
            borderRadius: '999px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            boxShadow:
              '0 18px 46px -10px rgba(255, 221, 45, .55), 0 0 0 8px rgba(255, 221, 45, .10)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '-15px',
              borderRadius: '999px',
              border: '1px solid rgba(255, 221, 45, .20)',
              pointerEvents: 'none',
            }}
          />
          <Icon id="i-bookmark" style={{ width: '42px', height: '42px', strokeWidth: 2.6, color: 'var(--brand-foreground)' }} />
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: '21px',
            letterSpacing: '-0.02em',
            marginTop: '6px',
          }}
        >
          Заявка опубликована
        </div>
        <div style={{ fontSize: '15px', color: 'var(--muted-foreground)' }}>
          ищем тебе попутку
        </div>
      </div>

      {/* Детали заявки */}
      <Card>
        <div
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '6px',
          }}
        >
          Что ищем
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', margin: '4px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              fontSize: '15px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <div
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                background: 'var(--brand)',
                flexShrink: 0,
              }}
            />
            {FROM_LABEL}
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
              fontSize: '15px',
              fontWeight: 600,
              minHeight: '24px',
            }}
          >
            <div
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                border: '2px solid var(--brand)',
                background: 'var(--brand)',
                flexShrink: 0,
              }}
            />
            {TO_LABEL}
          </div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '8px' }}>
          К <b style={{ color: 'var(--foreground)', fontWeight: 700 }}>{DESIRED_TIME}</b> · {SEATS_LABEL}
        </div>
      </Card>

      {/* Инфо-блок */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          background: 'var(--accent)',
          borderRadius: 'var(--radius-xl)',
          padding: '13px 14px',
          boxShadow:
            'inset 0 0 0 1px rgba(255, 221, 45, .12), var(--shadow-card)',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '12px',
            background: 'var(--gradient-brand)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--brand-foreground)',
            flexShrink: 0,
            boxShadow: '0 8px 20px -10px rgba(255, 221, 45, .6)',
          }}
        >
          <Icon id="i-bell" style={{ width: '18px', height: '18px', strokeWidth: 2 }} />
        </div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--foreground)' }}>
          Водители маршрута видят заявку. Пуш придёт, как только выложат подходящую поездку.
        </div>
      </div>

      {cancelError && (
        <div
          style={{
            padding: '12px',
            background: 'var(--destructive)',
            color: 'var(--destructive-foreground)',
            borderRadius: 'var(--radius-lg)',
            fontSize: '15px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div>{cancelError}</div>
          <button
            type="button"
            onClick={() => setCancelError(null)}
            style={{
              background: 'transparent',
              border: '1px solid currentColor',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              color: 'inherit',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Закрыть
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button
          variant="primary"
          icon="i-share"
          disabled={isCancelling}
          onClick={handleShare}
        >
          Поделиться заявкой
        </Button>
        <Button
          variant="ghost"
          disabled={isCancelling}
          onClick={() => {
            hapticImpact('light');
            onEdit?.();
          }}
        >
          Изменить заявку
        </Button>
        <button
          type="button"
          onClick={() => {
            void handleCancel();
          }}
          disabled={isCancelling}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--foreground)',
            opacity: isCancelling ? 0.35 : 0.6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: '8px',
            cursor: isCancelling ? 'default' : 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {isCancelling ? 'Отменяем…' : 'Отменить'}
        </button>
      </div>
    </div>
  );
};

export default RequestPublishedScreen;
