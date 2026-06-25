// Тонкая обёртка над Telegram WebApp HapticFeedback.
// Безопасна вне Telegram и на клиентах, где API не поддерживается (просто no-op).
// По Apple HIG / Telegram guidelines: haptic — для подтверждений и важных действий,
// без переусердствования (не на каждый тап).

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotifyType = 'success' | 'warning' | 'error';

function hf() {
  return window.Telegram?.WebApp?.HapticFeedback;
}

/** Лёгкий/средний тактильный отклик на нажатие основной кнопки. */
export function hapticImpact(style: ImpactStyle = 'light') {
  try {
    hf()?.impactOccurred(style);
  } catch {
    /* API недоступен — тихо игнорируем */
  }
}

/** Уведомление об исходе действия: успех брони/публикации, предупреждение SOS. */
export function hapticNotify(type: NotifyType) {
  try {
    hf()?.notificationOccurred(type);
  } catch {
    /* no-op */
  }
}

/** Переключение выбора: чипы времени, тумблеры, степпер мест, табы. */
export function hapticSelection() {
  try {
    hf()?.selectionChanged();
  } catch {
    /* no-op */
  }
}
