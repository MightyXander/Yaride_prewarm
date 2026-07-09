import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  DESKTOP_BREAKPOINT,
  DESKTOP_BACK_BUTTON_OFFSET_PX,
  MOBILE_BACK_BUTTON_OFFSET_PX,
  DESKTOP_MAX_PX,
  SIDEBAR_PX,
  CONTAINER_INSET_PX,
} from '../lib/layout';
import { isNavVisibleForScreen } from './FloatingNav';
import type { Screen } from '../types/navigation';

interface BackButtonProps {
  onClick: () => void;
  show: boolean;
  /** Текущий экран — нужен, чтобы знать, виден ли на нём десктоп-сайдбар
   * (issue #379, было DesktopNav-топбар #365): на flow-экранах (HIDDEN_ON) сайдбара
   * нет даже на десктопе, и содержимое центрируется как раньше — без сдвига под сайдбар. */
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

  // Сайдбар (issue #379) занимает только горизонтальное место слева — в отличие от
  // бывшего DesktopNav-топбара (#365) он никогда не резервирует место сверху, поэтому
  // top-отступ теперь всегда один и тот же, на мобиле и на десктопе.
  const topOffset = 'calc(env(safe-area-inset-top) + 12px)';

  // Виден ли сейчас сайдбар (те же правила, что у него самого — isNavVisibleForScreen):
  // если виден, контент справа от сайдбара центрируется в оставшейся ширине —
  // формула отступа должна прибавлять SIDEBAR_PX. Если не виден (flow-экраны, HIDDEN_ON)
  // — контент, как и раньше, центрируется по всей ширине вьюпорта без сайдбара.
  const sidebarVisible = isDesktop && isNavVisibleForScreen(currentScreen);

  let leftValue: string;
  if (!isDesktop) {
    leftValue = `max(calc(env(safe-area-inset-left) + 16px), calc(50% - ${MOBILE_BACK_BUTTON_OFFSET_PX}px))`;
  } else if (!sidebarVisible) {
    leftValue = `max(calc(env(safe-area-inset-left) + 16px), calc(50% - ${DESKTOP_BACK_BUTTON_OFFSET_PX}px))`;
  } else {
    // Контент справа от сайдбара: его левый край — SIDEBAR_PX + половина зазора,
    // если оставшаяся ширина больше DESKTOP_MAX_PX (широкие мониторы), иначе контент
    // просто прижат к сайдбару (зазора нет). Кнопка стоит на CONTAINER_INSET_PX
    // правее этого края — тот же отступ, что и без сайдбара.
    leftValue = `max(calc(env(safe-area-inset-left) + 16px), calc(${SIDEBAR_PX}px + max(0px, (100% - ${SIDEBAR_PX}px - ${DESKTOP_MAX_PX}px) / 2) + ${CONTAINER_INSET_PX}px))`;
  }

  return createPortal(
    <button
      onClick={onClick}
      aria-label="Назад"
      className="focus-ring pressable"
      style={{
        position: 'fixed',
        top: topOffset,
        // Привязываем к левому краю контент-области (не к краю вьюпорта) — иначе на
        // широком десктопе кнопка улетает влево от приложения/сайдбара. Формула зависит
        // от режима (мобиль/десктоп без сайдбара/десктоп с сайдбаром) — см. leftValue выше.
        left: leftValue,
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
