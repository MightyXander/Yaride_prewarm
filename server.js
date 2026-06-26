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
    createRating: mod.handleCreateRating,
    getTripBookings: mod.handleGetTripBookings,
    cancelBooking: mod.handleCancelBooking,
    debugCounts: mod.handleDebugCounts,
  };
  console.log('Data layer + API ready (PostgreSQL).');
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
app.post('/api/ratings', wrap(api?.createRating));
app.get('/api/trips/:id/bookings', wrap(api?.getTripBookings));
app.patch('/api/bookings/:id', wrap(api?.cancelBooking));

// Issue #50: временный диагностический эндпоинт для верификации self-healing демо-данных.
app.get('/api/_debug/counts', wrap(api?.debugCounts));

app.use(express.static(path.join(__dirname, 'dist')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
