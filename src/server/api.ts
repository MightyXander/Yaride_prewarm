/**
 * JSON-API prewarm поверх async pg-repo (issue #10).
 *
 * Обработчики намеренно НЕ зависят от типов Express (в проекте нет @types/express
 * и express@5 не поставляет типы): каждый принимает нормализованный ApiRequest
 * (query/params/body/headers как plain-объекты) и возвращает ApiResponse
 * ({ status, body }). Тонкие Express-обёртки живут в server.js и просто
 * перекладывают req→ApiRequest и ApiResponse→res. Это держит strict-TS зелёным
 * и изолирует бизнес-логику/валидацию от транспорта.
 *
 * Эндпоинты:
 *   GET  /api/trips?corridor=&window=morning|evening&date=YYYY-MM-DD
 *   GET  /api/trips/:id
 *   POST /api/bookings        { tripId, seats?, initData }
 *   POST /api/alerts          { fromPointId, toPointId, date, time?, initData }
 *   POST /api/trips           { templateId, date, departureTime, initData }
 *
 * Валидация входа — ручная (zod в deps нет). Telegram initData проверяется через
 * verifyInitData (HMAC по BOT_TOKEN; без токена — dev-bypass с пометкой).
 */

import {
  createBooking,
  createRouteAlert,
  createTripFromTemplate,
  ensureUser,
  findOpenTrips,
  getTripCard,
  type FindTripsParams,
  type TimeSlot,
} from './repo.ts';
import {
  telegramDisplayName,
  verifyInitData,
  type TelegramUser,
} from './telegram.ts';

export interface ApiRequest {
  query: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

/** Стандартный JSON-ответ ошибки. */
function err(status: number, error: string, extra?: Record<string, unknown>): ApiResponse {
  return { status, body: { error, ...extra } };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Положительное целое из строки/числа, либо undefined. */
function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number.parseInt(value.trim(), 10);
    return n > 0 ? n : undefined;
  }
  return undefined;
}

const TIME_SLOTS: readonly TimeSlot[] = ['morning', 'evening'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function toTimeSlot(value: unknown): TimeSlot | undefined {
  if (typeof value === 'string' && (TIME_SLOTS as readonly string[]).includes(value)) {
    return value as TimeSlot;
  }
  return undefined;
}

/**
 * Классификация ошибок репозитория createBooking → HTTP-код.
 * Бизнес-правила (своя поездка/уже забронировано/нет мест) — 409 Conflict.
 * Не найдено — 404. Профиль не найден не должен возникать (JIT создаёт), но 400.
 */
function bookingErrorStatus(message: string): number {
  if (message.includes('не найдена')) {
    return 404;
  }
  if (
    message.includes('Свободных мест') ||
    message.includes('уже забронировали') ||
    message.includes('свою поездку') ||
    message.includes('недоступна')
  ) {
    return 409;
  }
  if (message.includes('Профиль')) {
    return 400;
  }
  return 400;
}

/**
 * Достать и проверить initData из тела/заголовка. Возвращает пользователя или
 * ApiResponse-ошибку 401. Заголовок X-Telegram-Init-Data имеет приоритет над body.
 */
function authenticate(
  req: ApiRequest,
  bodyInitData: unknown,
): { user: TelegramUser; devBypass: boolean } | ApiResponse {
  const headerInit =
    req.headers['x-telegram-init-data'] ?? req.headers['X-Telegram-Init-Data'];
  const initData =
    (typeof headerInit === 'string' && headerInit) ||
    (typeof bodyInitData === 'string' ? bodyInitData : undefined);

  const result = verifyInitData(initData, process.env.BOT_TOKEN);
  if (!result.ok || result.user === null) {
    return err(401, result.error ?? 'Неавторизованный запрос Telegram', {
      devBypass: result.devBypass,
    });
  }
  return { user: result.user, devBypass: result.devBypass };
}

/** GET /api/trips — список открытых поездок по коридору/окну/дате. */
export async function handleListTrips(req: ApiRequest): Promise<ApiResponse> {
  const params: FindTripsParams = {};

  // corridor: "startPointId-endPointId" (необязательно). Любой край опционален.
  const corridor = req.query.corridor;
  if (corridor !== undefined && corridor.trim() !== '') {
    const [rawStart, rawEnd] = corridor.split('-');
    const startId = toPositiveInt(rawStart);
    const endId = toPositiveInt(rawEnd);
    if (startId === undefined && endId === undefined) {
      return err(400, 'corridor должен быть в формате "<startPointId>-<endPointId>"');
    }
    if (startId !== undefined) {
      params.startPointId = startId;
    }
    if (endId !== undefined) {
      params.endPointId = endId;
    }
  }

  const window = req.query.window;
  if (window !== undefined && window.trim() !== '') {
    const slot = toTimeSlot(window);
    if (slot === undefined) {
      return err(400, 'window должен быть "morning" или "evening"');
    }
    params.timeSlot = slot;
  }

  const date = req.query.date;
  if (date !== undefined && date.trim() !== '') {
    if (!DATE_RE.test(date.trim())) {
      return err(400, 'date должен быть в формате YYYY-MM-DD');
    }
    params.tripDate = date.trim();
  }

  const trips = await findOpenTrips(params);
  return { status: 200, body: { trips } };
}

/** GET /api/trips/:id — карточка поездки или 404. */
export async function handleGetTrip(req: ApiRequest): Promise<ApiResponse> {
  const id = toPositiveInt(req.params.id);
  if (id === undefined) {
    return err(400, 'Некорректный id поездки');
  }
  const card = await getTripCard(id);
  if (card === null) {
    return err(404, 'Поездка не найдена');
  }
  return { status: 200, body: { trip: card } };
}

/** POST /api/bookings — бронь места с JIT-профилем пассажира. */
export async function handleCreateBooking(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const auth = authenticate(req, body.initData);
  if ('status' in auth) {
    return auth;
  }
  const { user } = auth;

  const tripId = toPositiveInt(body.tripId);
  if (tripId === undefined) {
    return err(400, 'tripId обязателен и должен быть положительным целым');
  }

  let seats = 1;
  if (body.seats !== undefined) {
    const s = toPositiveInt(body.seats);
    if (s === undefined) {
      return err(400, 'seats должен быть положительным целым');
    }
    seats = s;
  }

  // JIT-профиль: имя из Telegram initData.
  await ensureUser({
    tgUserId: user.id,
    name: telegramDisplayName(user),
    username: user.username ?? null,
  });

  try {
    const result = await createBooking(user.id, tripId, seats);
    return { status: 201, body: { booking: result } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось создать бронь';
    return err(bookingErrorStatus(message), message);
  }
}

/** POST /api/alerts — подписка на коридор при пустом поиске. */
export async function handleCreateAlert(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const auth = authenticate(req, body.initData);
  if ('status' in auth) {
    return auth;
  }
  const { user } = auth;

  const fromPointId = toPositiveInt(body.fromPointId);
  const toPointId = toPositiveInt(body.toPointId);
  if (fromPointId === undefined || toPointId === undefined) {
    return err(400, 'fromPointId и toPointId обязательны (положительные целые)');
  }

  const rawDate = typeof body.date === 'string' ? body.date.trim() : '';
  if (!DATE_RE.test(rawDate)) {
    return err(400, 'date обязателен в формате YYYY-MM-DD');
  }

  let desiredTime: string | null = null;
  if (body.time !== undefined && body.time !== null && body.time !== '') {
    if (typeof body.time !== 'string' || !TIME_RE.test(body.time.trim())) {
      return err(400, 'time должен быть в формате HH:MM');
    }
    desiredTime = body.time.trim();
  }

  await ensureUser({
    tgUserId: user.id,
    name: telegramDisplayName(user),
    username: user.username ?? null,
  });

  try {
    const alert = await createRouteAlert({
      tgPassengerId: user.id,
      fromPointId,
      toPointId,
      desiredDate: rawDate,
      desiredTime,
    });
    return { status: 201, body: { alert } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось создать подписку';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/** POST /api/trips — публикация поездки из шаблона водителя (опционально). */
export async function handlePublishTrip(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const auth = authenticate(req, body.initData);
  if ('status' in auth) {
    return auth;
  }
  const { user } = auth;

  const templateId = toPositiveInt(body.templateId);
  if (templateId === undefined) {
    return err(400, 'templateId обязателен (положительное целое)');
  }

  const rawDate = typeof body.date === 'string' ? body.date.trim() : '';
  if (!DATE_RE.test(rawDate)) {
    return err(400, 'date обязателен в формате YYYY-MM-DD');
  }

  const rawTime =
    typeof body.departureTime === 'string' ? body.departureTime.trim() : '';
  if (!TIME_RE.test(rawTime)) {
    return err(400, 'departureTime обязателен в формате HH:MM');
  }

  // Водитель должен иметь профиль; JIT создаёт, шаблон проверит принадлежность.
  await ensureUser({
    tgUserId: user.id,
    name: telegramDisplayName(user),
    username: user.username ?? null,
  });

  try {
    const trip = await createTripFromTemplate({
      tgDriverId: user.id,
      templateId,
      tripDate: rawDate,
      departureTime: rawTime,
    });
    return { status: 201, body: { trip } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось опубликовать поездку';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}
