import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация слоя данных PostgreSQL (пул + схема + сид коридора при первом старте).
// Компилируется из src/server через `tsc -b` (npm run build / build:server) в dist-server/.
// Импорт в try/catch: если серверный код ещё не собран или нет DATABASE_URL,
// раздача SPA не ломается, а /health честно отдаёт db:false.
let pingDb = null;
try {
  const mod = await import('./dist-server/index.js');
  await mod.initDb();
  pingDb = mod.pingDb;
  console.log('Data layer ready (PostgreSQL).');
} catch (err) {
  console.error(
    'Data layer not initialized (build with `npm run build:server` and set DATABASE_URL):',
    err?.message ?? err,
  );
}

const app = express();
const PORT = process.env.PORT || 3000;

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
  res.status(200).json({ status: 'ok', db });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
