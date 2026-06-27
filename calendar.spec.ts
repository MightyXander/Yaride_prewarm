import { test, expect } from '@playwright/test';

test.describe('Calendar — выбор даты публикации поездки', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/');

    // Пройти онбординг: выбрать роль "Водитель"
    const driverCard = page.locator('text=Водитель').first();
    await driverCard.waitFor({ state: 'visible', timeout: 5000 });
    await driverCard.click();

    // Кликнуть "Продолжить"
    const continueBtn = page.getByRole('button', { name: /продолжить/i });
    await continueBtn.click();

    // Дождаться главного экрана
    await page.waitForTimeout(1000);

    // Кликнуть по баннеру "СЕГОДНЯ ПО МАРШРУТУ" (жёлтая карточка с ближайшей поездкой)
    const todayBanner = page.locator('text=/СЕГОДНЯ/i').first();
    await todayBanner.waitFor({ state: 'visible', timeout: 5000 });
    await todayBanner.click();

    // Дождаться загрузки формы публикации
    await page.waitForTimeout(500);
    await expect(page.getByText(/Маршрут/i)).toBeVisible({ timeout: 5000 });
  });

  test('открытие календаря по клику на поле даты (light theme)', async ({ page }) => {
    // Найти кнопку выбора даты
    const dateButton = page.locator('button[aria-expanded]').first();
    await expect(dateButton).toBeVisible();

    // Проверить, что календарь скрыт
    await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/)).not.toBeVisible();

    // Открыть календарь
    await dateButton.click();
    await page.waitForTimeout(300);

    // Проверить, что календарь раскрылся
    await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/).first()).toBeVisible();

    // Скриншот (light theme)
    await page.screenshot({ path: 'qa-issue-150-calendar-open-light.png', fullPage: true });
  });

  test('открытие календаря в dark theme', async ({ page }) => {
    // Переключить на dark theme через профиль
    const profileTab = page.getByRole('button', { name: /профиль/i });
    await profileTab.click();
    await page.waitForTimeout(200);

    const themeBtn = page.getByRole('button', { name: /тема/i });
    await themeBtn.click();
    await page.waitForTimeout(300);

    // Вернуться к главной и открыть публикацию
    const mainTab = page.getByRole('button', { name: /главная/i });
    await mainTab.click();
    await page.waitForTimeout(200);

    const publishBtn = page.getByRole('button', { name: /опубликовать поездку/i });
    await publishBtn.click();
    await page.waitForTimeout(500);

    // Открыть календарь
    const dateButton = page.locator('button[aria-expanded]').first();
    await dateButton.click();
    await page.waitForTimeout(300);

    // Проверить отображение
    await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/).first()).toBeVisible();

    // Скриншот (dark theme)
    await page.screenshot({ path: 'qa-issue-150-calendar-open-dark.png', fullPage: true });
  });

  test('выбор будущей даты в календаре', async ({ page }) => {
    // Открыть календарь
    const dateButton = page.locator('button[aria-expanded]').first();
    const initialText = await dateButton.textContent();
    await dateButton.click();
    await page.waitForTimeout(300);

    // Выбрать следующий день (если сегодня последний день месяца, переключим месяц)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Если завтра в следующем месяце, кликнуть "Следующий месяц"
    if (tomorrow.getMonth() !== today.getMonth()) {
      const nextMonthBtn = page.getByRole('button', { name: /следующий месяц/i });
      await nextMonthBtn.click();
      await page.waitForTimeout(200);
    }

    // Кликнуть на день (завтра)
    const dayButtons = page.locator('button[aria-label]').filter({ hasText: new RegExp(`^${tomorrow.getDate()}$`) });
    const firstAvailableDay = dayButtons.first();
    await firstAvailableDay.click();
    await page.waitForTimeout(300);

    // Проверить, что календарь закрылся и дата обновилась
    await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/).first()).not.toBeVisible();

    const updatedText = await dateButton.textContent();
    expect(updatedText).not.toBe(initialText);

    // Скриншот после выбора
    await page.screenshot({ path: 'qa-issue-150-calendar-date-selected-light.png', fullPage: true });
  });

  test('навигация по месяцам в календаре', async ({ page }) => {
    // Открыть календарь
    const dateButton = page.locator('button[aria-expanded]').first();
    await dateButton.click();
    await page.waitForTimeout(300);

    // Проверить текущий заголовок
    const headerText = await page.locator('text=/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/').first().textContent();

    // Кликнуть "Следующий месяц"
    const nextBtn = page.getByRole('button', { name: /следующий месяц/i });
    await nextBtn.click();
    await page.waitForTimeout(200);

    // Проверить, что заголовок изменился
    const newHeaderText = await page.locator('text=/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/').first().textContent();
    expect(newHeaderText).not.toBe(headerText);

    // Вернуться назад
    const prevBtn = page.getByRole('button', { name: /предыдущий месяц/i });
    await prevBtn.click();
    await page.waitForTimeout(200);

    // Проверить, что вернулись к исходному месяцу
    const restoredHeaderText = await page.locator('text=/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/').first().textContent();
    expect(restoredHeaderText).toBe(headerText);
  });

  test('публикация поездки на выбранную дату', async ({ page }) => {
    // Открыть календарь и выбрать завтра
    const dateButton = page.locator('button[aria-expanded]').first();
    await dateButton.click();
    await page.waitForTimeout(300);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (tomorrow.getMonth() !== today.getMonth()) {
      const nextMonthBtn = page.getByRole('button', { name: /следующий месяц/i });
      await nextMonthBtn.click();
      await page.waitForTimeout(200);
    }

    const dayButtons = page.locator('button[aria-label]').filter({ hasText: new RegExp(`^${tomorrow.getDate()}$`) });
    await dayButtons.first().click();
    await page.waitForTimeout(300);

    // Опубликовать поездку
    const publishBtn = page.getByRole('button', { name: /опубликовать поездку/i });
    await publishBtn.click();
    await page.waitForTimeout(1000);

    // Проверить, что перешли на экран подтверждения или список поездок
    await expect(page.getByText(/опубликована|водителя|бронирований/i)).toBeVisible({ timeout: 5000 });

    // Скриншот финального состояния
    await page.screenshot({ path: 'qa-issue-150-trip-published-light.png', fullPage: true });
  });

  test('проверка подсветки сегодня и выбранной даты', async ({ page }) => {
    // Открыть календарь
    const dateButton = page.locator('button[aria-expanded]').first();
    await dateButton.click();
    await page.waitForTimeout(300);

    // Найти кнопку с сегодняшней датой (должна иметь бренд-рамку)
    const today = new Date().getDate();
    const todayButtons = page.locator('button[aria-label]').filter({ hasText: new RegExp(`^${today}$`) });

    // Проверить, что элемент с сегодняшней датой имеет специальное оформление
    // (визуальная проверка через скриншот)
    await page.screenshot({ path: 'qa-issue-150-calendar-today-highlight.png', fullPage: true });
  });
});
