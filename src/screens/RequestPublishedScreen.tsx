import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { hapticImpact } from '../lib/haptics';

// Экран 20 SPEC: Заявка опубликована
// Успех-стейт после публикации заявки пассажира. Показываем что ищем + действия.

interface RequestPublishedScreenProps {
  onEdit?: () => void;
  onCancel?: () => void;
}

const RequestPublishedScreen: React.FC<RequestPublishedScreenProps> = ({ onEdit, onCancel }) => {
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
        <div style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>
          ищем тебе попутку
        </div>
      </div>

      {/* Детали заявки */}
      <Card>
        <div
          style={{
            fontSize: '11px',
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
              fontSize: '13px',
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
            Центр, пл. Волкова
          </div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '8px' }}>
          К <b style={{ color: 'var(--foreground)', fontWeight: 700 }}>8:30</b> · 1 пассажир
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
          variant="ghost"
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
            hapticImpact('light');
            onCancel?.();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--foreground)',
            opacity: 0.6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: '8px',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Отменить
        </button>
      </div>
    </div>
  );
};

export default RequestPublishedScreen;
