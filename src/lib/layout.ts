// Общие константы ширины оболочки приложения (issue #365).
// Переиспользуются в App.tsx (структурная раскладка) и BackButton.tsx (позиционирование),
// чтобы избежать дублирования magic-чисел между режимами мобиль/десктоп.

/** Ширина мобильной колонки (как раньше — единственный режим до итерации #365). */
export const MOBILE_COLUMN_PX = 430;

/** Максимальная ширина центрированного контента в десктоп-раскладке. */
export const DESKTOP_MAX_PX = 1100;

/** Брейкпоинт переключения мобиль → десктоп-раскладка (see useMediaQuery). */
export const DESKTOP_BREAKPOINT = '(min-width: 900px)';

/** Ширина постоянного левого сайдбара на десктопе (issue #379, заменяет DesktopNav-топбар #365). */
export const SIDEBAR_PX = 264;

/** Внутренний отступ контент-контейнера от его края (использовался как часть magic 199).
 * Экспортируется — переиспользуется BackButton.tsx для формулы отступа рядом с сайдбаром. */
export const CONTAINER_INSET_PX = 16;

/** Отступ слева для BackButton в мобильном режиме: половина колонки минус внутр. отступ. */
export const MOBILE_BACK_BUTTON_OFFSET_PX = MOBILE_COLUMN_PX / 2 - CONTAINER_INSET_PX;

/** Отступ слева для BackButton в десктоп-режиме: половина широкого контейнера минус отступ. */
export const DESKTOP_BACK_BUTTON_OFFSET_PX = DESKTOP_MAX_PX / 2 - CONTAINER_INSET_PX;
