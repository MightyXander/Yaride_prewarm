/**
 * Поведенческая аналитика mini-app (issue #473): клики (`ui_click`) и просмотры
 * экранов (`screen_view`) батчами на POST /api/events/track (бэк пишет в
 * таблицу events через logEvent).
 *
 * Клики: ОДИН глобальный слушатель `click` в capture-фазе на document. Цель —
 * ближайший элемент с `[data-track]`, иначе ближайший `button`/`a`; label =
 * data-track || aria-label || textContent.trim().slice(0, 40). Элементы без
 * label (голые div) не трекаются. Значения `input`/`textarea` НИКОГДА не
 * попадают в события (privacy): label читается только из атрибутов/текста
 * кнопок и ссылок, value полей ввода не используется.
 *
 * Батчинг: очередь в памяти; flush раз в 5 сек или при 20 событиях; на
 * `visibilitychange → hidden` — navigator.sendBeacon (fetch с keepalive: true,
 * если beacon недоступен/отказал). Ошибки отправки молча глотаются — аналитика
 * никогда не деградирует UX и не бросает.
 */

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_AT_QUEUE_SIZE = 20;
/** Серверный потолок батча (handleTrackEvents дропает хвост сверх 50). */
const MAX_BATCH = 50;
const LABEL_MAX_LEN = 40;

interface TrackedEvent {
  type: 'ui_click' | 'screen_view';
  screen: string;
  element?: string;
}

let queue: TrackedEvent[] = [];
let initialized = false;
/** Последний затреканный экран: гвард от дублей screen_view (StrictMode/ре-рендеры). */
let lastTrackedScreen: string | null = null;

function flush(useBeacon: boolean): void {
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(batch.length);

  try {
    const payload = JSON.stringify(batch);

    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      // Beacon доезжает при скрытии/закрытии страницы; заголовки не поддерживает —
      // Telegram-пользователь в этой ветке опознаётся только cookie-сессией
      // (same-origin), иначе события пишутся анонимно. userId на бэке опционален.
      const ok = navigator.sendBeacon(
        '/api/events/track',
        new Blob([payload], { type: 'application/json' }),
      );
      if (ok) return;
      // Beacon отказал (переполнена его очередь) — падаем в fetch ниже.
    }

    // Заголовок initData — как в apiFetch/errorReporter: даёт бэку опознать
    // Telegram-пользователя; браузерная cookie-сессия уходит сама (same-origin).
    const initData = window.Telegram?.WebApp?.initData ?? '';
    void fetch('/api/events/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
      },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Сервер недоступен/сеть упала — молча глотаем, события теряем.
    });
  } catch {
    // Аналитика никогда не бросает.
  }
}

function enqueue(event: TrackedEvent): void {
  queue.push(event);
  if (queue.length >= FLUSH_AT_QUEUE_SIZE) flush(false);
}

/** Label клика: data-track || aria-label || видимый текст (обрезка до 40). */
function clickLabel(el: Element): string {
  const dataTrack = el.getAttribute('data-track');
  if (dataTrack !== null && dataTrack.trim() !== '') return dataTrack.trim();
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel !== null && ariaLabel.trim() !== '') return ariaLabel.trim();
  // Privacy: текст полей ввода не читаем вовсе (textContent у input пуст, но
  // ветка отрезает и вложенные в label инпуты от попадания value в событие).
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return '';
  return (el.textContent ?? '').trim().slice(0, LABEL_MAX_LEN);
}

/**
 * Зафиксировать просмотр экрана. Вызывать на каждой смене экрана в App.tsx
 * (включая первый показ); подряд идущие дубли одного экрана схлопываются.
 */
export function trackScreenView(screen: string): void {
  if (screen === '' || screen === lastTrackedScreen) return;
  lastTrackedScreen = screen;
  enqueue({ type: 'screen_view', screen });
}

/**
 * Инициализация: глобальный click-слушатель (capture) + периодический flush +
 * добив очереди через sendBeacon при уходе страницы в hidden. Повторный вызов —
 * no-op (StrictMode-безопасно).
 */
export function initAnalytics(getCurrentScreen: () => string): void {
  if (initialized) return;
  initialized = true;

  document.addEventListener(
    'click',
    (e) => {
      try {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('[data-track]') ?? target.closest('button, a');
        if (el === null) return;
        const label = clickLabel(el);
        if (label === '') return;
        enqueue({ type: 'ui_click', screen: getCurrentScreen(), element: label });
      } catch {
        // Аналитика никогда не ломает обработку клика.
      }
    },
    true,
  );

  window.setInterval(() => flush(false), FLUSH_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}
