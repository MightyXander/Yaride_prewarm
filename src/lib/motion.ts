/**
 * Токены анимаций (issue #467): единые длительности, кривые и spring-конфиги
 * для ключевых «моментов» UI — переходов экранов, splash, шитов, появления
 * контента. Компоненты берут значения отсюда; хардкод убирается по мере касания.
 */

export type Bezier = [number, number, number, number];

/** Длительности в секундах — для framer-motion `transition.duration`. */
export const durations = {
  /** Короткий exit/кроссфейд списков. */
  fast: 0.15,
  /** Базовое появление контента (Appear). */
  base: 0.21,
  /** Кроссфейд skeleton → контент (Suspense fallback). */
  crossfade: 0.24,
  /** Fade перехода экрана при prefers-reduced-motion. */
  reducedScreen: 0.12,
} as const;

/** Длительности в миллисекундах — для CSS transition / setTimeout. */
export const durationsMs = {
  /** Fade затемнения за шитом. */
  sheetBackdrop: 220,
  /** Уход шита вниз (tween на закрытие). */
  sheetExit: 200,
  /** Удержание шита в DOM после закрытия (≥ sheetExit + запас на кадр). */
  sheetUnmount: 220,
  /** Полный уход splash (совпадает с transform-transition в index.css). */
  splashHide: 550,
} as const;

/** Кривые cubic-bezier — массивы для framer-motion `transition.ease`. */
export const easings: Record<'out' | 'inOut' | 'emphasizedOut', Bezier> = {
  /** ease-out — появление контента. */
  out: [0.25, 0.1, 0.25, 1],
  /** ease-in-out — симметричные fade (splash hide). */
  inOut: [0.45, 0, 0.55, 1],
  /** Выразительный ease-out с мягким довозом (логотип splash). */
  emphasizedOut: [0.22, 1, 0.36, 1],
};

/** Те же кривые строками — для CSS `transition`. */
export const cssEase = {
  out: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  inOut: 'cubic-bezier(0.45, 0, 0.55, 1)',
  emphasizedOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

/** Spring-конфиги framer-motion. */
export const springs = {
  /**
   * Переход между экранами (App.tsx screenVariants) — плотный, быстро
   * гаснущий, без заметного overshoot (иначе микро-слайд «пружинит» текст).
   */
  screen: { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.9 },
  /**
   * Шит снизу — упругий подъём практически без отскока: overshoot по y
   * показал бы щель между шитом и нижним краем экрана.
   */
  sheet: { type: 'spring' as const, stiffness: 460, damping: 44, mass: 1 },
};

/** Stagger элементов списка (AppearList), мс между соседями. */
export const listStaggerMs = 40;

/**
 * Статическая проверка prefers-reduced-motion (паттерн Appear/шитов:
 * значение на момент загрузки, живая подписка не нужна — настройка ОС
 * меняется вне сессии). Для реактивного значения — useReducedMotion.
 */
export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
