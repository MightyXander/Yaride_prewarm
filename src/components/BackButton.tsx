import { useEffect } from 'react';
import { Icon } from './Icons';

interface BackButtonProps {
  onClick: () => void;
  show: boolean;
}

const BackButton: React.FC<BackButtonProps> = ({ onClick, show }) => {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    // Показываем нативную BackButton только если Telegram API >= 6.1 (когда BackButton появился)
    if (tg?.BackButton && tg.isVersionAtLeast('6.1')) {
      if (show) {
        tg.BackButton.show();
        tg.BackButton.onClick(onClick);
      } else {
        tg.BackButton.hide();
      }

      return () => {
        tg.BackButton.offClick(onClick);
        tg.BackButton.hide();
      };
    }
  }, [onClick, show]);

  // In-app fallback button рендерим ВСЕГДА при show=true (даже внутри Telegram, если нет BackButton API)
  if (!show) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      aria-label="Назад"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 12px)',
        // Привязываем к левому краю центрированной 390px-колонки приложения,
        // а не к краю вьюпорта: иначе на широком десктопе кнопка улетает влево
        // от приложения. 179px = 195 (половина колонки) − 16 (внутр. отступ).
        left: 'max(calc(env(safe-area-inset-left) + 16px), calc(50% - 179px))',
        width: '32px',
        height: '32px',
        borderRadius: '11px',
        background: 'var(--secondary)',
        border: 'none',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        color: 'var(--foreground)',
        zIndex: 100,
        transition: 'transform 0.08s ease, filter 0.12s ease',
        outline: 'none',
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.92)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onFocus={(e) => {
        e.currentTarget.style.filter = 'brightness(1.08)';
        e.currentTarget.style.outline = '2px solid var(--brand)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={(e) => {
        e.currentTarget.style.filter = 'none';
        e.currentTarget.style.outline = 'none';
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.05)';
      }}
    >
      <Icon id="i-chev-l" />
    </button>
  );
};

export default BackButton;
