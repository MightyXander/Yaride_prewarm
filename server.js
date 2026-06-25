import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация слоя данных (схема + сид коридора при первом старте).
// Компилируется из src/server через `tsc -b` (npm run build / build:server) в dist-server/.
// Импорт в try/catch: если серверный код ещё не собран, раздача SPA и /health не ломаются.
let dbReady = false;
try {
  const { initDb } = await import('./dist-server/index.js');
  const { dbPath } = initDb();
  dbReady = true;
  console.log(`Data layer ready, DB at ${dbPath}`);
} catch (err) {
  console.error('Data layer not initialized (run `npm run build:server`):', err?.message ?? err);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', db: dbReady });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
