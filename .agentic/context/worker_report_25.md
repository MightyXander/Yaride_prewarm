## Worker Report — Issue #25

### ✅ Выполнено
- [x] Экран 21 «Главный (вечер)»: переиспользование MainScreen с пропсами title/heroKicker, вечерние рыба-trips
- [x] Экран 22 «Карточка (вечер)»: переиспользование TripDetailsScreen с вечерним Trip (отдельный экран не требуется)
- [x] Экран 23 «Водитель публикует (вечер)»: параметризация DriverPublishScreen (title, timeOptions, routes, pickup)
- [x] Экран 24 «Домой как вчера»: НОВЫЙ HabitHomeScreen с Hero(вечер) + бледно-жёлтой карточкой постоянного водителя
- [x] Расширение типов навигации (evening-main, evening-publish, habit-home)
- [x] Точка входа из ProfileScreen: пункт «Вечер: домой как вчера» → habit-home
- [x] Light+dark темы, 360/390px без горизонтального скролла, тач-цели ≥44pt, haptics
- [x] oxlint/tsc/npm run build — зелёные

### 📝 Изменённые файлы
| Файл | Изменение |
|------|-----------|
| src/types/navigation.ts | Добавлены Screen types: evening-main, evening-publish, habit-home |
| src/hooks/useNavigation.ts | Добавлены новые экраны в PARENT_SCREEN и scrollPositions |
| src/screens/MainScreen.tsx | Параметризация: добавлены пропсы title, heroKicker (дефолты сохранены) |
| src/screens/DriverPublishScreen.tsx | Параметризация: title, timeOptions, routeFrom/To, routeLabel, defaultPickup, вечерние PICKUP_OPTIONS |
| src/screens/HabitHomeScreen.tsx | НОВЫЙ экран с Hero + бледно-жёлтой карточкой (color-mix oklab 16%) |
| src/screens/ProfileScreen.tsx | Добавлен пункт меню «Вечер: домой как вчера» → onHabitHome |
| src/App.tsx | Вечерние trips, regularDriver, рендеринг evening-main/evening-publish/habit-home |
| src/components/FloatingNav.tsx | Маппинг вечерних экранов в SCREEN_TO_TAB, evening-publish в HIDDEN_ON |

### ✅ Тесты
- npx oxlint — PASSED (0 issues)
- tsc -b — PASSED (0 errors)
- npm run build — PASSED (dist: 429.43 kB, gzip: 122.74 kB)

### 🏗️ Архитектурные решения
- **Переиспользование компонентов**: MainScreen и DriverPublishScreen параметризованы через пропсы вместо дублирования вёрстки (принцип DRY)
- **Экран 22 не требуется**: вечерняя карточка поездки = переиспользование TripDetailsScreen с вечерним Trip через navigate('trip-details', eveningTrip)
- **Бледно-жёлтый фон**: color-mix(in oklab, var(--brand) 16%, var(--card)) + border-color: color-mix(in oklab, var(--brand) 42%, transparent) — точно по мокапу класс .regular
- **Навигационный граф**: ProfileScreen → habit-home → evening-main → evening-publish; BackButton показывается везде кроме intro/main/main-more/evening-main/habit-home (глобальная логика из #21)
- **FloatingNav**: вечерние экраны привязаны к табу 'main' (поездки), evening-publish скрыт (flow-экран)
- **Вечерние рыба-trips**: Марина С. (VW Polo, 17:40, 2 места), Олег В. (Hyundai Solaris, 18:05, 3 места) — Центр → Брагино

### 🚧 Риски / follow-up
- Рыба-данные: вечерние trips, regularDriver — заглушки, после плана B будут заменены на API
- Точка сбора «пл. Волкова, у фонтана»: сейчас в EVENING_PICKUP_OPTIONS как value='volkova', может потребоваться дополнительная валидация при интеграции с backend

### 📦 Commit
45b13d3 — feat(ui): вечерние экраны 21–24 — коридор Центр→Брагино 17:30–19:00 (#25)

### 🔗 Branch
feature/issue-25 → pushed to origin
