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
  };
  telegram = {
    sendMessage: mod.sendMessage,
    setWebhook: mod.setWebhook,
    handleWebhookUpdate: mod.handleWebhookUpdate,
  };
  console.log('Data layer + API ready (PostgreSQL).');

  // Issue #85: установить webhook для Telegram-бота при наличии BOT_TOKEN и PUBLIC_URL.
  const botToken = (process.env.BOT_TOKEN ?? '').trim();
  const webhookSecret = (process.env.WEBHOOK_SECRET ?? '').trim();
  const publicUrl =
    (
      process.env.WEBHOOK_URL ??
      process.env.RAILWAY_PUBLIC_DOMAIN ??
      process.env.RAILWAY_STATIC_URL ??
      ''
    ).trim();

  if (botToken !== '' && publicUrl !== '') {
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
    if (botToken === '') {
      console.log('BOT_TOKEN отсутствует — webhook для Telegram-бота не установлен (dev mode)');
    } else if (publicUrl === '') {
      console.log(
        'PUBLIC_URL отсутствует (WEBHOOK_URL / RAILWAY_PUBLIC_DOMAIN / RAILWAY_STATIC_URL) — webhook для Telegram-бота не установлен',
      );
    }
  }
} catch (err) {
  console.error(
    'Data layer not initialized (build with `npm run build:server` and set DATABASE_URL):',
    err?.message ?? err,
  );
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
app.post('/api/bookings', wrap(api?.createBooking));
app.post('/api/alerts', wrap(api?.createAlert));

// Issue #42: новые эндпоинты для профиля, поездок пользователя, рейтингов, броней водителя.
app.get('/api/me/profile', wrap(api?.getMyProfile));
app.get('/api/me/trips', wrap(api?.getMyTrips));
app.get('/api/me/template', wrap(api?.getMyTemplate));
app.post('/api/me/license', wrap(api?.submitLicense));
app.post('/api/ratings', wrap(api?.createRating));
app.get('/api/trips/:id/bookings', wrap(api?.getTripBookings));
app.patch('/api/bookings/:id', wrap(api?.cancelBooking));

// Issue #68: справочник точек коридора для домена Заявки.
app.get('/api/route-points', wrap(api?.listRoutePoints));

// Issue #54: debug endpoint для проверки наполнения БД (dev/прод demo-seed).
app.get('/api/_debug/counts', wrap(api?.debugCounts));

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
