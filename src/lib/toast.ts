// Шина тостов (без JSX — чистый модуль, чтобы не ломать react-fast-refresh).
// showToast вызывают экраны; ToastHost (компонент) подписывается через subscribeToast.

type Listener = (message: string) => void;

let listener: Listener | null = null;

export function showToast(message: string) {
  listener?.(message);
}

export function subscribeToast(fn: Listener) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
