import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация слоя данных PostgreSQL (пул + схема + сид коридора при первом старте)
// + JSON-API обработчики (issue #10). Компилируется из src/server через `tsc -b`
// (npm run build / build:server) в dist-server/. Импорт в try/catch: если серверный
// код ещё не собран или нет DATABASE_URL, раздача SPA не ломается, а /health честно
// отдаёт db:false и API возвращает 503.
let pingDb = null;
let api = null;
let dbSchema = null;
let telegram = null;
try {
  const mod = await import('./dist-server/index.js');
  await mod.initDb();
  pingDb = mod.pingDb;
  dbSchema = mod.getSchemaName?.() ?? null;
  api = {
    listTrips: mod.handleListTrips,
    getTrip: mod.handleGetTrip,
    createBooking: mod.handleCreateBooking,
    createAlert: mod.handleCreateAlert,
    publishTrip: mod.handlePublishTrip,
    getMyProfile: mod.handleGetMyProfile,
    getMyTrips: mod.handleGetMyTrips,
    getMyTemplate: mod.handleGetMyTemplate,
    createRating: mod.handleCreateRating,
    getTripBookings: mod.handleGetTripBookings,
    cancelBooking: mod.handleCancelBooking,
    listRoutePoints: mod.handleListRoutePoints,
    debugCounts: mod.handleDebugCounts,
    submitLicense: mod.handleSubmitLicense,
    getUserProfile: mod.handleGetUserProfile,
    getUserReviews: mod.handleGetUserReviews,
    getNotifications: mod.handleGetNotifications,
    markNotificationRead: mod.handleMarkNotificationRead,
    listMyCars: mod.handleListMyCars,
    addCar: mod.handleAddCar,
    cancelTrip: mod.handleCancelTrip,
  };
  telegram = {
    sendMessage: mod.sendMessage,
    setWebhook: mod.setWebhook,
    handleWebhookUpdate: mod.handleWebhookUpdate,
  };
  console.log('Data layer + API ready (PostgreSQL).');

  // Telegram-бот: два режима доставки апдейтов.
  //  - webhook (issue #85): Telegram сам POST-ит на PUBLIC_URL/webhook/telegram.
  //  - long polling (BOT_MODE=polling): сервер сам тянет getUpdates (исходящий канал).
  // На RF-хостинге входящий webhook от Telegram режется DPI (Connection timed out),
  // поэтому на VPS в РФ используется polling — исходящие запросы к api.telegram.org
  // работают (при необходимости через пин IPv4 в /etc/hosts контейнера).
  const botToken = (process.env.BOT_TOKEN ?? '').trim();
  const botMode = (process.env.BOT_MODE ?? '').trim().toLowerCase();
  const webhookSecret = (process.env.WEBHOOK_SECRET ?? '').trim();
  const publicUrl =
    (
      process.env.WEBHOOK_URL ??
      process.env.RAILWAY_PUBLIC_DOMAIN ??
      process.env.RAILWAY_STATIC_URL ??
      ''
    ).trim();

  if (botToken === '') {
    console.log('BOT_TOKEN отсутствует — Telegram-бот не запущен (dev mode)');
  } else if (botMode === 'polling') {
    await startLongPolling(telegram, botToken);
  } else if (publicUrl !== '') {
    const webhookPath = '/webhook/telegram';
    const fullWebhookUrl = publicUrl.startsWith('http')
      ? `${publicUrl}${webhookPath}`
      : `https://${publicUrl}${webhookPath}`;

    const webhookOk = await telegram.setWebhook(
      fullWebhookUrl,
      webhookSecret || undefined,
      botToken,
    );
    if (!webhookOk) {
      console.error('Не удалось установить webhook для Telegram-бота');
    }
  } else {
    console.log(
      'Ни BOT_MODE=polling, ни PUBLIC_URL (WEBHOOK_URL / RAILWAY_PUBLIC_DOMAIN) — Telegram-бот не запущен',
    );
  }
} catch (err) {
  console.error(
    'Data layer not initialized (build with `npm run build:server` and set DATABASE_URL):',
    err?.message ?? err,
  );
}

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Вызов метода Bot API (POST JSON). Возвращает разобранный ответ Telegram. */
async function tgApi(token, method, payload) {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  return res.json();
}

/**
 * Long polling: снимаем webhook и в фоне тянем getUpdates, скармливая каждый
 * апдейт в тот же handleWebhookUpdate, что и webhook-роут. Цикл не блокирует
 * app.listen и переживает сетевые сбои (пауза + повтор).
 */
async function startLongPolling(telegram, botToken) {
  try {
    // webhook и polling взаимоисключающи; очередь не сбрасываем (drop=false),
    // чтобы уже пришедшие /start были обработаны через getUpdates.
    await tgApi(botToken, 'deleteWebhook', { drop_pending_updates: false });
  } catch (err) {
    console.error('deleteWebhook перед polling не удался:', err?.message ?? err);
  }
  console.log('Telegram-бот: режим long polling (getUpdates).');

  const miniAppUrl = process.env.MINIAPP_URL;
  let offset = 0;

  (async function loop() {
    for (;;) {
      try {
        const data = await tgApi(botToken, 'getUpdates', {
          offset,
          timeout: 30,
          allowed_updates: ['message', 'callback_query'],
        });
        if (!data || data.ok !== true) {
          console.error('getUpdates ok=false:', data?.description ?? '');
          await sleep(3000);
          continue;
        }
        for (const update of data.result ?? []) {
          offset = update.update_id + 1;
          try {
            await telegram.handleWebhookUpdate(update, miniAppUrl, botToken);
          } catch (err) {
            console.error('Ошибка обработки апдейта:', err?.message ?? err);
          }
        }
      } catch (err) {
        console.error('getUpdates сбой:', err?.message ?? err);
        await sleep(3000);
      }
    }
  })();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// /health: лёгкий SELECT 1 к Postgres. db:true только если пинг прошёл.
app.get('/health', async (req, res) => {
  let db = false;
  if (pingDb !== null) {
    try {
      db = await pingDb();
    } catch (err) {
      console.error('Health DB ping failed:', err?.message ?? err);
      db = false;
    }
  }
  res.status(200).json({ status: 'ok', db, schema: dbSchema });
});

/**
 * Тонкая обёртка: ApiRequest ← Express req, Express res ← ApiResponse.
 * Если слой данных не инициализирован (нет сборки/DATABASE_URL) — 503.
 * Любая необработанная ошибка обработчика → 500 с JSON.
 */
function wrap(handler) {
  return async (req, res) => {
    if (handler === undefined || handler === null) {
      res.status(503).json({ error: 'Слой данных недоступен' });
      return;
    }
    try {
      const apiReq = {
        query: req.query ?? {},
        params: req.params ?? {},
        body: req.body ?? {},
        headers: req.headers ?? {},
      };
      const result = await handler(apiReq);
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('API handler error:', err?.message ?? err);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  };
}

// JSON-API (issue #10). api === null до успешной инициализации → wrap отдаёт 503.
app.get('/api/trips', wrap(api?.listTrips));
app.get('/api/trips/:id', wrap(api?.getTrip));
app.post('/api/trips', wrap(api?.publishTrip));
app.post('/api/trips/:id/cancel', wrap(api?.cancelTrip));
app.post('/api/bookings', wrap(api?.createBooking));
app.post('/api/alerts', wrap(api?.createAlert));

// Issue #42: новые эндпоинты для профиля, поездок пользователя, рейтингов, броней водителя.
app.get('/api/me/profile', wrap(api?.getMyProfile));
app.get('/api/me/trips', wrap(api?.getMyTrips));
app.get('/api/me/template', wrap(api?.getMyTemplate));
app.get('/api/me/cars', wrap(api?.listMyCars));
app.post('/api/me/cars', wrap(api?.addCar));
app.post('/api/me/license', wrap(api?.submitLicense));
app.post('/api/ratings', wrap(api?.createRating));
app.get('/api/trips/:id/bookings', wrap(api?.getTripBookings));
app.patch('/api/bookings/:id', wrap(api?.cancelBooking));

// Issue #68: справочник точек коридора для домена Заявки.
app.get('/api/route-points', wrap(api?.listRoutePoints));

// Issue #54: debug endpoint для проверки наполнения БД (dev/прод demo-seed).
app.get('/api/_debug/counts', wrap(api?.debugCounts));

// Issue #198: публичный профиль пользователя и его отзывы.
app.get('/api/users/:id/profile', wrap(api?.getUserProfile));
app.get('/api/users/:id/reviews', wrap(api?.getUserReviews));

// Issue #204: уведомления (NotificationsScreen).
app.get('/api/notifications', wrap(api?.getNotifications));
app.post('/api/notifications/read', wrap(api?.markNotificationRead));

// Issue #85: Telegram webhook endpoint.
app.post('/webhook/telegram', async (req, res) => {
  if (!telegram) {
    res.status(503).json({ error: 'Telegram handler недоступен' });
    return;
  }

  const webhookSecret = (process.env.WEBHOOK_SECRET ?? '').trim();
  if (webhookSecret !== '') {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== webhookSecret) {
      console.error('Webhook: неверный X-Telegram-Bot-Api-Secret-Token');
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  try {
    const update = req.body;
    await telegram.handleWebhookUpdate(
      update,
      process.env.MINIAPP_URL,
      process.env.BOT_TOKEN,
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook handler error:', err?.message ?? err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
