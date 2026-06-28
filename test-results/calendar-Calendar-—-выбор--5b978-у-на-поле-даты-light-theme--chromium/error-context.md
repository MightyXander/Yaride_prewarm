# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calendar.spec.ts >> Calendar — выбор даты публикации поездки >> открытие календаря по клику на поле даты (light theme)
- Location: calendar.spec.ts:30:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button[aria-expanded]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button[aria-expanded]').first()

```

```yaml
- text: Брагино → Центр среда, утро 7:30–8:40
- button "Сменить направление": ⇄
- button "Возьму попутчиков":
  - img
- button "Уведомления":
  - img
- img
- text: Сегодня по маршруту
- heading "2 поездки в твою сторону" [level=2]
- 'button "Перейти к поездке: Ближайшая в 07:40"':
  - img
  - text: Ближайшая в 07:40
- button "Поездка от Андрей К. в 07:40, 2 места, нажмите чтобы раскрыть":
  - text: АК
  - img
  - text: 4.9 Андрей К.
  - img
  - text: 37 поездок Брагино, ул. Урицкого, 12 авто ≈80 ₽ 07:40 2 места
- button "Поездка от Марина С. в 07:55, 3 места, нажмите чтобы раскрыть":
  - text: МС
  - img
  - text: 5 Марина С.
  - img
  - text: 12 поездок Брагино, пр-т Дзержинского, 8 авто ≈70 ₽ 07:55 3 места
- navigation "Основная навигация":
  - button "Поездки":
    - img
    - text: Поездки
  - button "Профиль":
    - img
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Calendar — выбор даты публикации поездки', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     await page.setViewportSize({ width: 390, height: 844 });
  6   |     await page.goto('http://localhost:5173/');
  7   | 
  8   |     // Пройти онбординг: выбрать роль "Водитель"
  9   |     const driverCard = page.locator('text=Водитель').first();
  10  |     await driverCard.waitFor({ state: 'visible', timeout: 5000 });
  11  |     await driverCard.click();
  12  | 
  13  |     // Кликнуть "Продолжить"
  14  |     const continueBtn = page.getByRole('button', { name: /продолжить/i });
  15  |     await continueBtn.click();
  16  | 
  17  |     // Дождаться главного экрана
  18  |     await page.waitForTimeout(1000);
  19  | 
  20  |     // Кликнуть по баннеру "СЕГОДНЯ ПО МАРШРУТУ" (жёлтая карточка с ближайшей поездкой)
  21  |     const todayBanner = page.locator('text=/СЕГОДНЯ/i').first();
  22  |     await todayBanner.waitFor({ state: 'visible', timeout: 5000 });
  23  |     await todayBanner.click();
  24  | 
  25  |     // Дождаться загрузки формы публикации
  26  |     await page.waitForTimeout(500);
  27  |     await expect(page.getByText(/Маршрут/i)).toBeVisible({ timeout: 5000 });
  28  |   });
  29  | 
  30  |   test('открытие календаря по клику на поле даты (light theme)', async ({ page }) => {
  31  |     // Найти кнопку выбора даты
  32  |     const dateButton = page.locator('button[aria-expanded]').first();
> 33  |     await expect(dateButton).toBeVisible();
      |                              ^ Error: expect(locator).toBeVisible() failed
  34  | 
  35  |     // Проверить, что календарь скрыт
  36  |     await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/)).not.toBeVisible();
  37  | 
  38  |     // Открыть календарь
  39  |     await dateButton.click();
  40  |     await page.waitForTimeout(300);
  41  | 
  42  |     // Проверить, что календарь раскрылся
  43  |     await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/).first()).toBeVisible();
  44  | 
  45  |     // Скриншот (light theme)
  46  |     await page.screenshot({ path: 'qa-issue-150-calendar-open-light.png', fullPage: true });
  47  |   });
  48  | 
  49  |   test('открытие календаря в dark theme', async ({ page }) => {
  50  |     // Переключить на dark theme через профиль
  51  |     const profileTab = page.getByRole('button', { name: /профиль/i });
  52  |     await profileTab.click();
  53  |     await page.waitForTimeout(200);
  54  | 
  55  |     const themeBtn = page.getByRole('button', { name: /тема/i });
  56  |     await themeBtn.click();
  57  |     await page.waitForTimeout(300);
  58  | 
  59  |     // Вернуться к главной и открыть публикацию
  60  |     const mainTab = page.getByRole('button', { name: /главная/i });
  61  |     await mainTab.click();
  62  |     await page.waitForTimeout(200);
  63  | 
  64  |     const publishBtn = page.getByRole('button', { name: /опубликовать поездку/i });
  65  |     await publishBtn.click();
  66  |     await page.waitForTimeout(500);
  67  | 
  68  |     // Открыть календарь
  69  |     const dateButton = page.locator('button[aria-expanded]').first();
  70  |     await dateButton.click();
  71  |     await page.waitForTimeout(300);
  72  | 
  73  |     // Проверить отображение
  74  |     await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/).first()).toBeVisible();
  75  | 
  76  |     // Скриншот (dark theme)
  77  |     await page.screenshot({ path: 'qa-issue-150-calendar-open-dark.png', fullPage: true });
  78  |   });
  79  | 
  80  |   test('выбор будущей даты в календаре', async ({ page }) => {
  81  |     // Открыть календарь
  82  |     const dateButton = page.locator('button[aria-expanded]').first();
  83  |     const initialText = await dateButton.textContent();
  84  |     await dateButton.click();
  85  |     await page.waitForTimeout(300);
  86  | 
  87  |     // Выбрать следующий день (если сегодня последний день месяца, переключим месяц)
  88  |     const today = new Date();
  89  |     const tomorrow = new Date(today);
  90  |     tomorrow.setDate(tomorrow.getDate() + 1);
  91  | 
  92  |     // Если завтра в следующем месяце, кликнуть "Следующий месяц"
  93  |     if (tomorrow.getMonth() !== today.getMonth()) {
  94  |       const nextMonthBtn = page.getByRole('button', { name: /следующий месяц/i });
  95  |       await nextMonthBtn.click();
  96  |       await page.waitForTimeout(200);
  97  |     }
  98  | 
  99  |     // Кликнуть на день (завтра)
  100 |     const dayButtons = page.locator('button[aria-label]').filter({ hasText: new RegExp(`^${tomorrow.getDate()}$`) });
  101 |     const firstAvailableDay = dayButtons.first();
  102 |     await firstAvailableDay.click();
  103 |     await page.waitForTimeout(300);
  104 | 
  105 |     // Проверить, что календарь закрылся и дата обновилась
  106 |     await expect(page.getByText(/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/).first()).not.toBeVisible();
  107 | 
  108 |     const updatedText = await dateButton.textContent();
  109 |     expect(updatedText).not.toBe(initialText);
  110 | 
  111 |     // Скриншот после выбора
  112 |     await page.screenshot({ path: 'qa-issue-150-calendar-date-selected-light.png', fullPage: true });
  113 |   });
  114 | 
  115 |   test('навигация по месяцам в календаре', async ({ page }) => {
  116 |     // Открыть календарь
  117 |     const dateButton = page.locator('button[aria-expanded]').first();
  118 |     await dateButton.click();
  119 |     await page.waitForTimeout(300);
  120 | 
  121 |     // Проверить текущий заголовок
  122 |     const headerText = await page.locator('text=/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/').first().textContent();
  123 | 
  124 |     // Кликнуть "Следующий месяц"
  125 |     const nextBtn = page.getByRole('button', { name: /следующий месяц/i });
  126 |     await nextBtn.click();
  127 |     await page.waitForTimeout(200);
  128 | 
  129 |     // Проверить, что заголовок изменился
  130 |     const newHeaderText = await page.locator('text=/Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь/').first().textContent();
  131 |     expect(newHeaderText).not.toBe(headerText);
  132 | 
  133 |     // Вернуться назад
```