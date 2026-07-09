import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DESKTOP_BREAKPOINT, DESKTOP_BACK_BUTTON_OFFSET_PX, MOBILE_BACK_BUTTON_OFFSET_PX } from '../lib/layout';
import { DESKTOP_NAV_HEIGHT } from './DesktopNav';
import { isNavVisibleForScreen } from './FloatingNav';
import type { Screen } from '../types/navigation';

interface BackButtonProps {
  onClick: () => void;
  show: boolean;
  /** Текущий экран — нужен, чтобы знать, рендерится ли на нём DesktopNav-топбар
   * (issue #365): на flow-экранах (HIDDEN_ON) топбара нет даже на десктопе, и кнопка
   * должна оставаться у самого верха, а не резервировать место под несуществующий топбар. */
  currentScreen: Screen;
}

const BackButton: React.FC<BackButtonProps> = ({ onClick, show, currentScreen }) => {
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

  // In-app fallback рендерим ТОЛЬКО когда нативной кнопки «Назад» нет (вне Telegram / старые клиенты).
  // На iOS/Android/Desktop Telegram есть системная кнопка/свайп «Назад» (её включает useEffect выше) —
  // свою НЕ дублируем, иначе на экране две кнопки «Назад».
  const tg = window.Telegram?.WebApp;
  const nativeBackAvailable = !!(tg?.BackButton && tg.isVersionAtLeast?.('6.1'));
  // Хук вызывается безусловно ДО раннего return ниже (rules-of-hooks).
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  if (!show || nativeBackAvailable) {
    return null;
  }

  const backButtonOffsetPx = isDesktop ? DESKTOP_BACK_BUTTON_OFFSET_PX : MOBILE_BACK_BUTTON_OFFSET_PX;
  // На десктопе поверх контента есть DesktopNav-топбар (issue #365) — без сдвига кнопка
  // «Назад» перекрывала бы лого/табы навигации. Но топбар рендерится не на всех экранах
  // (flow-экраны из HIDDEN_ON скрывают его так же, как FloatingNav) — резервируем место
  // под него, только если он реально виден на текущем экране.
  const desktopTopbarVisible = isDesktop && isNavVisibleForScreen(currentScreen);
  const topOffset = desktopTopbarVisible
    ? `calc(${DESKTOP_NAV_HEIGHT} + env(safe-area-inset-top) + 12px)`
    : 'calc(env(safe-area-inset-top) + 12px)';

  return createPortal(
    <button
      onClick={onClick}
      aria-label="Назад"
      className="focus-ring pressable"
      style={{
        position: 'fixed',
        top: topOffset,
        // Привязываем к левому краю центрированного контент-контейнера приложения (#40),
        // а не к краю вьюпорта: иначе на широком десктопе кнопка улетает влево от приложения.
        // Отступ — общая константа контейнера (issue #365, MOBILE/DESKTOP_BACK_BUTTON_OFFSET_PX
        // в lib/layout.ts), больше не magic-число. На узких вьюпортах кнопка встаёт на 16px
        // (край full-width приложения), на широких — у левого края контент-контейнера.
        left: `max(calc(env(safe-area-inset-left) + 16px), calc(50% - ${backButtonOffsetPx}px))`,
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
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.05)';
      }}
    >
      <Icon id="i-chev-l" />
    </button>,
    document.body
  );
};

export default BackButton;
