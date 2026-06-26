# Yaride Prewarm — MVP «Один туннель»

> Попутчики по дороге на работу. Без давки. Коридор **Брагино ↔ Центр**, утро/вечер, будни.

## Стек

- **Frontend:** Vite + React + TypeScript SPA
- **Стилизация:** CSS variables, дизайн-система из `design/mockup-*.html` (бренд `#ffdd2d`, Manrope, светлая/тёмная темы)
- **Сервер:** Express (Node.js) — раздача build + `/health` для Railway healthcheck
- **Деплой:** Railway (`railway.json`, `Dockerfile`)

## Структура

```
├── src/
│   ├── components/       # UI-компоненты (Hero, TripCard, StatusBar, Icons...)
│   ├── App.tsx           # Главный экран (экран 2 мокапа)
│   └── index.css         # Дизайн-токены
├── design/               # HTML-мокапы (источник правды по визуалу)
├── server.js             # Express-сервер
├── Dockerfile            # Railway-деплой
└── railway.json          # Конфиг Railway (healthcheck /health)
```

## Локальный запуск

### Разработка (dev)

```bash
npm install
npm run dev
```

→ `http://localhost:5173`

### Продакшен (build + сервер)

```bash
npm run build
npm start
```

→ Сервер на порту `3000` (или `$PORT` для Railway).  
→ Healthcheck: `http://localhost:3000/health` → `{"status":"ok"}`

## Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| `PORT` | Порт сервера (Railway подставит автоматически) | `3000` |
| `DATABASE_URL` | PostgreSQL connection string (Railway managed DB) | — |
| `PGSSL` | Включить SSL для Postgres (`require`\|`true`\|`1`) | не задан |
| `DB_SCHEMA` | Имя схемы PostgreSQL | `prewarm` |
| `DEMO_SEED` | **Демо-seed для dev**: `true` → сеять демо-коридор (Брагино↔Центр, демо-водители, рыба-поездки на сегодня). **НЕ задавать на проде** (прод real-only, без демо). | не задан (прод) |
| `BOT_TOKEN` | Telegram bot token для проверки initData | — |

### Dev-среда (локальная)

Создайте `.env` (не коммитить):

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/yaride_dev
DEMO_SEED=true
BOT_TOKEN=your_bot_token_here
```

### Прод (Railway)

На Railway НЕ устанавливайте `DEMO_SEED` — коридор будет real-only (пуст до публикации реальных поездок).

## Деплой на Railway

1. **Создать новый сервис** в проекте Railway `intuitive-gentleness`, окружение `production`.
2. **Подключить репозиторий** `MightyXander/Yaride_prewarm`, ветка `main`.
3. **Railway автоматически обнаружит** `Dockerfile` и `railway.json`.
4. **Переменные окружения**:
   - `PORT` — Railway подставит автоматически.
   - `DATABASE_URL` — Railway подставит при подключении Postgres.
   - `PGSSL=require` — для Railway managed Postgres.
   - **НЕ устанавливайте `DEMO_SEED`** на проде (коридор real-only).
5. **Healthcheck** `/health` настроен в `railway.json`.

## Что реализовано (Issue #1)

- [x] Каркас Vite + React + TypeScript
- [x] Дизайн-токены и компоненты из мокапа 1:1 (hero, TripCard, StatusBar, Topbar, иконки SVG)
- [x] **Живой главный экран** (экран 2 мокапа): «Брагино → Центр», hero «3 поездки в твою сторону», список поездок-рыба, две кнопки-действия
- [x] Переключение тёмная/светлая тема (кнопка в UI)
- [x] Минимальный Express-сервер: `GET /health → 200`, раздача `dist/`, слушает `process.env.PORT`
- [x] Railway-конфиг (`Dockerfile`, `railway.json` с `healthcheckPath: /health`)
- [x] `npm run build` проходит без ошибок

## Что осталось (будущие issues)

- Экраны 1, 3–8 (JIT-регистрация, карточка поездки, пусто, бронь, публикация...)
- Backend API (поездки, бронь, коридор)
- Сценарии 9–20 (SOS, ВУ, заявки/алерты...)
- Telegram-бот + уведомления
- Полный Railway-деплой нового сервиса

## Источники

- `SPEC.md` — продуктовая спецификация MVP
- `design/mockup-dark.html`, `design/mockup-light.html` — 24 экрана, источник правды по визуалу
