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
 *   DELETE /api/alerts/:id    отмена заявки-алерта, только автор (issue #319)
 *   GET  /api/me/alerts       активные заявки текущего юзера (issue #321)
 *   POST /api/trips           { templateId, date, departureTime, initData }
 *   GET  /api/me/profile      (initData в заголовке X-Telegram-Init-Data)
 *   GET  /api/me/consent      статус согласия с Политикой ПДн/Офертой (issue #234)
 *   POST /api/me/consent      { pdnConsentVersion, offerConsentVersion } — зафиксировать согласие
 *   GET  /api/me/trips?status=upcoming|past
 *   GET  /api/me/template     (initData в заголовке X-Telegram-Init-Data)
 *   POST /api/ratings         { tripId, rateeId, stars, tags?, comment?, initData }
 *   GET  /api/trips/:id/bookings
 *   PATCH /api/bookings/:id   { action: 'cancel_by_driver', initData }
 *
 * Валидация входа — ручная (zod в deps нет). Telegram initData проверяется через
 * verifyInitData (HMAC по BOT_TOKEN; без токена — dev-bypass с пометкой).
 */

import {
  createRouteAlertById,
  cancelRouteAlertById,
  listActiveAlertsByPassengerId,
  AlertNotFoundError,
  AlertNotOwnerError,
  ensureUser,
  getUserConsent,
  recordUserConsent,
  findOpenTrips,
  getTripCard,
  getLatestLicenseRequest,
  createRatingById,
  getTripBookings,
  getTripParticipants,
  cancelBookingByDriver,
  cancelTripByDriver,
  listRoutePoints,
  getPublicUserProfile,
  listUserReviews,
  getUserPhoneById,
  updateUserPhone,
  upsertPushToken,
  getUserProfileById,
  getUserTripsById,
  createBookingById,
  listCarsByDriverId,
  createCarById,
  getOrCreateDriverTemplateById,
  submitLicenseRequestById,
  createTripFromTemplateById,
  getUserCredentials,
  addUserCredentials,
  findWebAccountByEmail,
  mergeAccounts,
  isEmailTaken,
  isUsernameTaken,
  UserConflictError,
  CredentialsAlreadySetError,
  logEvent,
  type FindTripsParams,
  type TimeSlot,
  type TripStatusFilter,
} from './repo.ts';
import {
  getSessionUserFromRequest,
  reissueSessionForUser,
  hashPassword,
  verifyPassword,
  getDummyHash,
  EMAIL_RE,
  USERNAME_RE,
  MIN_PASSWORD_LENGTH,
} from './auth.ts';
import {
  telegramDisplayName,
  verifyInitData,
  type TelegramUser,
} from './telegram.ts';
import {
  notifyPassengersAboutNewTrip,
  notifyDriverAboutNewBooking,
  notifyAdminAboutLicenseRequest,
  notifyPassengerAboutBookingDecision,
  notifyPassengersAboutTripCancellation,
} from './notify.ts';

export interface ApiRequest {
  query: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  /** IP клиента (req.ip из Express) — для троттлинга входа. */
  ip?: string;
  /**
   * Очередь Set-Cookie инструкций, накопленных во время резолва пользователя
   * (issue #312: переиздание cookie-сессии при рассинхроне с initData — см.
   * resolveCurrentUserId). Обработчики это поле сами не читают: тонкая обёртка
   * wrap() в server.js подмешивает его в ApiResponse.cookies после вызова
   * хендлера, поэтому вызывающие resolveCurrentUserId места менять не нужно.
   */
  pendingCookies?: SetCookieInstruction[];
}

/** Инструкция выставить/очистить cookie (применяется тонкой обёрткой в server.js). */
export interface SetCookieInstruction {
  name: string;
  /** null/undefined → очистить cookie (res.clearCookie). */
  value: string | null;
  options?: {
    maxAge?: number;
    httpOnly?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    secure?: boolean;
    path?: string;
  };
}

export interface ApiResponse {
  status: number;
  body: unknown;
  /** Cookies для Set-Cookie/clear (опц.) — авторизация. */
  cookies?: SetCookieInstruction[];
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

/** Минимальный запас времени (в минутах) между «сейчас» и моментом выезда (issue #330). */
const MIN_LEAD_MINUTES = 10;

/** Фиксированный сдвиг Europe/Moscow (UTC+3, без перехода на летнее время). */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Тексты ошибок — единые с клиентом, см. src/lib/dateLocal.ts:DEPARTURE_ERROR_MESSAGES. */
const DEPARTURE_ERROR_MESSAGES: Record<'past' | 'too_soon', string> = {
  past: 'Это время уже прошло — выберите другое',
  too_soon: `Поездку можно создать не позже чем за ${MIN_LEAD_MINUTES} минут до выезда`,
};

/**
 * Проверяет момент выезда (dateStr YYYY-MM-DD + timeStr HH:MM) на сервере:
 * нельзя публиковать в прошлом или менее чем за MIN_LEAD_MINUTES минут до
 * старта. «Сейчас» считаем в фиксированном МСК (UTC+3) — TZ хоста сервера
 * не гарантирована, вся аудитория в Ярославле (issue #330).
 *
 * Логика — зеркало src/lib/dateLocal.ts:validateDeparture. Модуль не шарится
 * между client/server сборками: tsconfig.server.json задаёт rootDir
 * "./src/server", импорт из src/lib сломал бы `tsc -b`.
 */
function validateDepartureMsk(dateStr: string, timeStr: string): 'past' | 'too_soon' | null {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  // Момент выезда как UTC-timestamp, если бы часы/минуты были стенным временем МСК.
  const departureUtcMs = Date.UTC(year, month - 1, day, hour, minute) - MSK_OFFSET_MS;
  const diffMs = departureUtcMs - Date.now();

  if (diffMs < 0) return 'past';
  if (diffMs < MIN_LEAD_MINUTES * 60 * 1000) return 'too_soon';
  return null;
}

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

/**
 * Резолв ВНУТРЕННЕГО users.id текущего пользователя для эндпоинтов, общих для
 * браузерных и Telegram-аккаунтов (issue #267).
 *
 * Приоритет (issue #312 — фикс утечки чужого профиля через устаревшую cookie в
 * общем браузере: https://github.com/MightyXander/Yaride_prewarm/issues/312):
 *  1) Если запрос несёт ВАЛИДНЫЙ (прошедший проверку подписи) X-Telegram-Init-Data —
 *     это Telegram-контекст, и initData АВТОРИТЕТНЕЕ cookie-сессии. JIT-резолвим
 *     профиль по initData. Если cookie-сессии нет либо она принадлежит ДРУГОМУ
 *     users.id — переиздаём сессию на юзера из initData (обновляем cookie), чтобы
 *     не осталась «залипшая» чужая сессия. Если cookie уже совпадает с юзером
 *     initData — ничего не переиздаём (без лишних переизданий на каждый повтор).
 *  2) Иначе (initData отсутствует ИЛИ не прошёл валидацию подписи) — как раньше,
 *     резолвим по cookie-сессии браузерной авторизации; email/пароль-флоу без
 *     initData этот приоритет не задевает.
 *  3) Если ни один способ не сработал — 401 (тот же контракт ошибки, что и раньше).
 *
 * Инструкция Set-Cookie при переиздании кладётся в req.pendingCookies — обёртка
 * wrap() в server.js подмешивает её в финальный ApiResponse.cookies, поэтому
 * сигнатуру и ~20 мест использования resolveCurrentUserId трогать не пришлось.
 */
async function resolveCurrentUserId(req: ApiRequest): Promise<number | ApiResponse> {
  const headerInit =
    req.headers['x-telegram-init-data'] ?? req.headers['X-Telegram-Init-Data'];
  const hasInitDataHeader = typeof headerInit === 'string' && headerInit.trim() !== '';

  if (hasInitDataHeader) {
    const initResult = verifyInitData(headerInit as string, process.env.BOT_TOKEN);
    if (initResult.ok && initResult.user !== null) {
      const profile = await ensureUser({
        tgUserId: initResult.user.id,
        name: telegramDisplayName(initResult.user),
        username: initResult.user.username ?? null,
      });

      const webUser = await getSessionUserFromRequest(req);
      if (webUser === null || webUser.id !== profile.id) {
        const cookie = await reissueSessionForUser(req, profile.id);
        req.pendingCookies = [...(req.pendingCookies ?? []), cookie];
      }
      return profile.id;
    }
    // Заголовок есть, но подпись невалидна — не блокируем сразу: ниже пробуем
    // cookie-сессию (п.2); если и её нет, ошибка ниже (п.3) повторит ровно то,
    // что вернула бы верификация initData (тот же authenticate()).
  }

  // 2) Браузерный аккаунт по cookie-сессии — getSessionUser отдаёт внутренний id.
  const webUser = await getSessionUserFromRequest(req);
  if (webUser !== null) {
    return webUser.id;
  }

  // 3) Ни валидного initData, ни валидной cookie-сессии.
  const auth = authenticate(req, req.headers['x-telegram-init-data']);
  if ('status' in auth) {
    return auth;
  }
  const profile = await ensureUser({
    tgUserId: auth.user.id,
    name: telegramDisplayName(auth.user),
    username: auth.user.username ?? null,
  });
  return profile.id;
}

/**
 * Нормализация и валидация РФ-номера телефона (issue #267).
 * Принимает 8XXXXXXXXXX, +7XXXXXXXXXX, 7XXXXXXXXXX и любые разделители
 * (пробелы, скобки, дефисы). Возвращает E.164-форму +7XXXXXXXXXX либо null,
 * если номер не похож на российский мобильный (10 цифр после кода, оператор «9»).
 */
function normalizeRuPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let national: string;
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  } else {
    return null;
  }
  // Российский мобильный: 10 цифр, код оператора начинается с 9.
  if (national.length !== 10 || national[0] !== '9') {
    return null;
  }
  return `+7${national}`;
}

/** GET /api/trips — список открытых поездок по коридору/окну/дате. */
export async function handleListTrips(req: ApiRequest): Promise<ApiResponse> {
  const params: FindTripsParams = {};

  // Опциональная аутентификация для определения is_own
  const authResult = authenticate(req, req.headers['x-telegram-init-data']);
  if ('user' in authResult) {
    // JIT-профиль при аутентифицированном запросе
    const userProfile = await ensureUser({
      tgUserId: authResult.user.id,
      name: telegramDisplayName(authResult.user),
      username: authResult.user.username ?? null,
    });
    params.currentUserId = userProfile.id;
  }

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

  // Метрики ликвидности (CEO Council): захват события поиска (zero-result
  // считается на агрегате по props.result_count === 0). Fire-and-forget —
  // logEvent никогда не бросает и не блокирует ответ.
  const searchCorridor =
    params.startPointId !== undefined && params.endPointId !== undefined
      ? `${params.startPointId}-${params.endPointId}`
      : null;
  void logEvent({
    type: 'search',
    userId: params.currentUserId ?? null,
    corridor: searchCorridor,
    props: { result_count: trips.length },
  });

  return { status: 200, body: { trips } };
}

/** GET /api/trips/:id — карточка поездки или 404. */
export async function handleGetTrip(req: ApiRequest): Promise<ApiResponse> {
  const id = toPositiveInt(req.params.id);
  if (id === undefined) {
    return err(400, 'Некорректный id поездки');
  }

  // Опциональная аутентификация для определения is_own
  const authResult = authenticate(req, req.headers['x-telegram-init-data']);
  let currentUserId: number | undefined;
  if ('user' in authResult) {
    const userProfile = await ensureUser({
      tgUserId: authResult.user.id,
      name: telegramDisplayName(authResult.user),
      username: authResult.user.username ?? null,
    });
    currentUserId = userProfile.id;
  }

  const card = await getTripCard(id, currentUserId);
  if (card === null) {
    return err(404, 'Поездка не найдена');
  }
  return { status: 200, body: { trip: card } };
}

/** POST /api/bookings — бронь места с JIT-профилем пассажира. */
export async function handleCreateBooking(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

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

  // Имя пассажира для уведомления — из профиля (работает для tg и браузерной сессии).
  const passengerProfile = await getUserProfileById(userId);
  const passengerName = passengerProfile?.name ?? 'Пассажир';

  try {
    const result = await createBookingById(userId, tripId, seats);

    // Fire-and-forget уведомление водителю о новой брони (не блокируем ответ)
    // Загружаем данные поездки для уведомления
    getTripCard(tripId)
      .then((tripCard) => {
        if (tripCard !== null) {
          // Метрики ликвидности (CEO Council) — событие успешной брони.
          void logEvent({
            type: 'booking_created',
            userId,
            corridor: `${tripCard.start_point_id}-${tripCard.end_point_id}`,
            props: { trip_id: tripId, booking_id: result.bookingId },
          });

          void notifyDriverAboutNewBooking({
            tripId,
            bookingId: result.bookingId,
            driverId: tripCard.driver_id,
            driverTgUserId: tripCard.driver_tg_user_id,
            passengerName,
            startTitle: tripCard.start_title,
            endTitle: tripCard.end_title,
            tripDate: tripCard.trip_date,
            departureTime: tripCard.departure_time,
            seatsBooked: seats,
          });
        }
      })
      .catch((err) => {
        // Ошибка уведомлений не должна ломать API — только логируем
        console.error('[handleCreateBooking] Ошибка fire-and-forget уведомлений:', err);
      });

    return { status: 201, body: { booking: result } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось создать бронь';
    return err(bookingErrorStatus(message), message);
  }
}

/** POST /api/alerts — подписка на коридор при пустом поиске. */
export async function handleCreateAlert(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

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

  // Проверка «не в прошлом / не раньше MIN_LEAD_MINUTES» применима только когда
  // задано конкретное желаемое время (issue #330); date без time — окно на весь день.
  if (desiredTime !== null) {
    const departureIssue = validateDepartureMsk(rawDate, desiredTime);
    if (departureIssue !== null) {
      return err(400, DEPARTURE_ERROR_MESSAGES[departureIssue]);
    }
  }

  try {
    const alert = await createRouteAlertById(userId, {
      fromPointId,
      toPointId,
      desiredDate: rawDate,
      desiredTime,
    });

    // Метрики ликвидности (CEO Council) — заявка-алерт = явный сигнал спроса.
    void logEvent({
      type: 'alert_created',
      userId,
      corridor: `${fromPointId}-${toPointId}`,
      props: { alert_id: alert.alertId },
    });

    return { status: 201, body: { alert } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось создать подписку';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/**
 * DELETE /api/alerts/:id — отменить заявку-алерт (issue #319). Доступ только
 * автору заявки: alert.passenger_id должен совпадать с resolveCurrentUserId,
 * иначе 403; отсутствующая заявка — 404.
 */
export async function handleCancelAlert(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const alertId = toPositiveInt(req.params.id);
  if (alertId === undefined) {
    return err(400, 'Некорректный id заявки');
  }

  try {
    const result = await cancelRouteAlertById(alertId, userId);
    return { status: 200, body: { alert: result } };
  } catch (e) {
    if (e instanceof AlertNotFoundError) {
      return err(404, e.message);
    }
    if (e instanceof AlertNotOwnerError) {
      return err(403, e.message);
    }
    const message = e instanceof Error ? e.message : 'Не удалось отменить заявку';
    return err(400, message);
  }
}

/**
 * GET /api/me/alerts — активные заявки текущего юзера (issue #321).
 *
 * Единственный способ вернуться к своей заявке после сессии создания
 * (id раньше жил только в состоянии навигации). Отдаёт только активные
 * заявки (не отменённые и не просроченные по дате) — см.
 * listActiveAlertsByPassengerId.
 */
export async function handleGetMyAlerts(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const alerts = await listActiveAlertsByPassengerId(userId);
  return { status: 200, body: { alerts } };
}

/** POST /api/trips — публикация поездки из шаблона водителя (опционально). */
export async function handlePublishTrip(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

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

  const departureIssue = validateDepartureMsk(rawDate, rawTime);
  if (departureIssue !== null) {
    return err(400, DEPARTURE_ERROR_MESSAGES[departureIssue]);
  }

  const reverse = typeof body.reverse === 'boolean' ? body.reverse : false;

  // Опциональная выбранная машина: её модель/цвет/номер попадут в поездку.
  const carId = toPositiveInt(body.carId);

  try {
    const trip = await createTripFromTemplateById(userId, {
      templateId,
      tripDate: rawDate,
      departureTime: rawTime,
      reverse,
      carId,
    });

    // Fire-and-forget уведомления пассажирам по route_alerts (не блокируем ответ)
    // Загружаем данные поездки для уведомления (названия точек)
    getTripCard(trip.tripId)
      .then((tripCard) => {
        if (tripCard !== null) {
          // Вычислить time_slot из departureTime (час < 12 → morning, иначе evening)
          const hour = parseInt(trip.departureTime.split(':')[0], 10);
          const timeSlot: 'morning' | 'evening' = hour < 12 ? 'morning' : 'evening';

          void notifyPassengersAboutNewTrip({
            tripId: trip.tripId,
            startPointId: tripCard.start_point_id,
            endPointId: tripCard.end_point_id,
            tripDate: trip.tripDate,
            timeSlot,
            departureTime: trip.departureTime,
            startTitle: tripCard.start_title,
            endTitle: tripCard.end_title,
          });
        }
      })
      .catch((err) => {
        // Ошибка уведомлений не должна ломать API — только логируем
        console.error('[handlePublishTrip] Ошибка fire-and-forget уведомлений:', err);
      });

    return { status: 201, body: { trip } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось опубликовать поездку';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/** GET /api/me/cars — машины текущего водителя. */
export async function handleListMyCars(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const cars = await listCarsByDriverId(userId);
  return { status: 200, body: { cars } };
}

/** POST /api/me/cars — добавить машину водителю (model обяз., color/plate опц.). */
export async function handleAddCar(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (model === '') {
    return err(400, 'model обязателен (марка/модель машины)');
  }
  const color =
    typeof body.color === 'string' && body.color.trim() !== '' ? body.color.trim() : null;
  const plate =
    typeof body.plate === 'string' && body.plate.trim() !== '' ? body.plate.trim() : null;

  try {
    const car = await createCarById(userId, { model, color, plate });
    return { status: 201, body: { car } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось добавить машину';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/** GET /api/me/profile — профиль текущего пользователя по initData. */
export async function handleGetMyProfile(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const profile = await getUserProfileById(userId);
  if (profile === null) {
    return err(404, 'Профиль не найден');
  }

  // Данные последней заявки ВУ — для блока «Отправлено» на статусном экране.
  const license = await getLatestLicenseRequest(profile.id);

  return {
    status: 200,
    body: {
      profile: {
        id: profile.id,
        name: profile.name,
        age: profile.age,
        rating_avg: profile.rating_avg,
        rating_count: profile.rating_count,
        trips_driver_count: profile.trips_driver_count,
        trips_passenger_count: profile.trips_passenger_count,
        license_status: profile.license_status,
        license_series: license?.series_number ?? null,
        license_valid_until: license?.valid_until ?? null,
      },
    },
  };
}

/**
 * GET /api/me/phone — телефон текущего пользователя для префилла (issue #267).
 * Работает и для браузерных, и для Telegram-аккаунтов (см. resolveCurrentUserId).
 */
export async function handleGetMyPhone(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const phone = await getUserPhoneById(userId);
  return { status: 200, body: { phone } };
}

/**
 * PUT /api/me/phone — сохранить телефон текущего пользователя (issue #267).
 * Body: { phone }. Номер нормализуется/валидируется (РФ, +7XXXXXXXXXX) и пишется
 * в users.phone. Верификация по SMS не выполняется (отложена). Возвращает
 * нормализованный номер.
 */
export async function handleSaveMyPhone(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const body = asRecord(req.body);
  const rawPhone = typeof body.phone === 'string' ? body.phone : '';
  const phone = normalizeRuPhone(rawPhone);
  if (phone === null) {
    return err(400, 'Введите корректный российский номер телефона', { field: 'phone' });
  }

  const ok = await updateUserPhone(userId, phone);
  if (!ok) {
    return err(404, 'Профиль не найден');
  }

  return { status: 200, body: { phone } };
}

/**
 * GET /api/me/consent — статус согласия текущего пользователя с Политикой ПДн
 * и Офертой (issue #234). Работает и для Telegram (JIT-резолв по initData,
 * см. resolveCurrentUserId), и для браузерных аккаунтов (cookie-сессия).
 * null-версии означают «согласие ещё не зафиксировано» — фронт сравнивает
 * их с POLICY_VERSION/OFFER_VERSION (src/lib/policy.ts) и решает, показывать
 * ли шаг согласия перед тем, как пустить пользователя в Сервис.
 */
export async function handleGetMyConsent(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const consent = await getUserConsent(userId);
  if (consent === null) {
    return err(404, 'Профиль не найден');
  }

  return {
    status: 200,
    body: {
      pdnConsentVersion: consent.pdnConsentVersion,
      offerConsentVersion: consent.offerConsentVersion,
    },
  };
}

/**
 * POST /api/me/consent — зафиксировать согласие текущего пользователя с
 * Политикой ПДн и Офертой (issue #234 — главный фикс блокера 152-ФЗ:
 * до этого Telegram-юзер создавался через ensureUser() JIT БЕЗ записи
 * согласия). Body: { pdnConsentVersion, offerConsentVersion } — версии
 * шлёт фронт из единого источника src/lib/policy.ts (тот же паттерн, что
 * и POST /api/auth/register для браузерной регистрации).
 */
export async function handleSetMyConsent(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const body = asRecord(req.body);
  const pdnConsentVersion = typeof body.pdnConsentVersion === 'string' ? body.pdnConsentVersion.trim() : '';
  const offerConsentVersion = typeof body.offerConsentVersion === 'string' ? body.offerConsentVersion.trim() : '';

  if (pdnConsentVersion === '') {
    return err(400, 'Не указана версия политики обработки ПДн', { field: 'pdnConsentVersion' });
  }
  if (offerConsentVersion === '') {
    return err(400, 'Не указана версия Оферты', { field: 'offerConsentVersion' });
  }

  const ok = await recordUserConsent(userId, pdnConsentVersion, offerConsentVersion);
  if (!ok) {
    return err(404, 'Профиль не найден');
  }

  return { status: 200, body: { pdnConsentVersion, offerConsentVersion } };
}

/**
 * GET /api/me/credentials — статус входа по email текущего пользователя (issue #273).
 * Фронт показывает секцию «Вход по email» только TG-аккаунтам без пароля
 * (hasPassword=false) и префиллит username из текущего снимка.
 */
export async function handleGetMyCredentials(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const cred = await getUserCredentials(userId);
  if (cred === null) {
    return err(404, 'Профиль не найден');
  }
  return {
    status: 200,
    body: { hasPassword: cred.hasPassword, email: cred.email, username: cred.username },
  };
}

/**
 * POST /api/me/credentials — добавить вход по email (email+username+пароль) к
 * текущему аккаунту без пароля (TG→браузер, issue #273). Единая users-карточка.
 * Body: { email, username, password }.
 *
 * Валидация — та же, что при регистрации (переиспользуем EMAIL_RE/USERNAME_RE/
 * MIN_PASSWORD_LENGTH и hashPassword из auth.ts). Конфликты:
 *  - 409 already_set — у аккаунта уже задан пароль (смена/управление — вне MVP);
 *  - 409 email_taken / username_taken — занятые email/ник (маппинг по коду/индексу).
 */
export async function handleAddMyCredentials(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const body = asRecord(req.body);
  const email = (typeof body.email === 'string' ? body.email : '').trim();
  const username = (typeof body.username === 'string' ? body.username : '').trim();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email)) {
    return err(400, 'Введите корректный email', { field: 'email' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return err(400, 'Пароль должен быть не короче 8 символов', { field: 'password' });
  }
  if (!USERNAME_RE.test(username)) {
    return err(400, 'Ник: только латиница, цифры и _', { field: 'username' });
  }

  // Cheap-win: занятость email/username ДО scrypt (гонку добивает индекс + 23505 в repo).
  if (await isEmailTaken(email)) {
    return err(409, 'Такой email уже зарегистрирован', { code: 'email_taken' });
  }
  if (await isUsernameTaken(username)) {
    return err(409, 'Этот ник уже занят', { code: 'username_taken' });
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await addUserCredentials({ userId, email, username, passwordHash });
    return {
      status: 200,
      body: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
        },
      },
    };
  } catch (e) {
    if (e instanceof CredentialsAlreadySetError) {
      return err(409, 'Для аккаунта уже настроен вход по email', { code: 'already_set' });
    }
    if (e instanceof UserConflictError) {
      const message =
        e.code === 'email_taken'
          ? 'Такой email уже зарегистрирован'
          : 'Этот ник уже занят';
      return err(409, message, { code: e.code });
    }
    throw e;
  }
}

/**
 * POST /api/me/link-account — привязать ранее заведённую браузерную учётку к
 * текущей TG-карточке (issue #300, defence). TG-пользователь вводит email+пароль
 * своей веб-учётки; сервер проверяет пароль и сливает веб-карточку в TG-карточку
 * (переиспользуем mergeAccounts). Так дубль лечится, а не остаётся жить.
 * Body: { email, password }.
 *
 * Гварды:
 *  - 401 invalid_credentials — email не найден или пароль неверный (constant-time);
 *  - 400 same_account — email принадлежит текущей же карточке (уже привязан);
 *  - 409 other_telegram — email привязан к ДРУГОМУ Telegram-аккаунту (мержить нельзя).
 */
export async function handleLinkMyAccount(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const body = asRecord(req.body);
  const email = (typeof body.email === 'string' ? body.email : '').trim();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email) || password.length === 0) {
    return err(400, 'Укажите email и пароль', { field: 'email' });
  }

  const web = await findWebAccountByEmail(email);
  // Constant-time: при отсутствии аккаунта всё равно гоняем scrypt по dummy-хешу,
  // чтобы нельзя было различить «нет такого email» по времени ответа.
  let ok: boolean;
  if (web !== null) {
    ok = await verifyPassword(password, web.password_hash);
  } else {
    await verifyPassword(password, await getDummyHash());
    ok = false;
  }
  if (!ok || web === null) {
    return err(401, 'Неверный email или пароль', { code: 'invalid_credentials' });
  }

  if (web.id === userId) {
    return err(400, 'Этот аккаунт уже привязан к вашему профилю', { code: 'same_account' });
  }
  if (web.tg_user_id !== null) {
    return err(409, 'Этот email привязан к другому Telegram-аккаунту', { code: 'other_telegram' });
  }

  // Сливаем веб-карточку (dupe) в текущую TG-карточку (keep): данные входа
  // (email/ник/пароль) и вся история браузерной учётки переезжают на TG-карточку.
  await mergeAccounts(userId, web.id);

  const creds = await getUserCredentials(userId);
  return {
    status: 200,
    body: {
      linked: true,
      email: creds?.email ?? email,
      username: creds?.username ?? null,
    },
  };
}

/** POST /api/me/push-token — сохранить FCM-токен устройства (issue #265). */
export async function handleSavePushToken(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const body = asRecord(req.body);
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token === '') {
    return err(400, 'token обязателен');
  }
  const platform =
    typeof body.platform === 'string' && body.platform.trim() !== ''
      ? body.platform.trim()
      : 'android';

  await upsertPushToken(userId, token, platform);
  return { status: 200, body: { ok: true } };
}

/** GET /api/me/trips?status=upcoming|past — поездки текущего пользователя. */
export async function handleGetMyTrips(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const statusParam = req.query.status ?? 'upcoming';
  if (statusParam !== 'upcoming' && statusParam !== 'past') {
    return err(400, 'status должен быть "upcoming" или "past"');
  }
  const statusFilter = statusParam as TripStatusFilter;

  const trips = await getUserTripsById(userId, statusFilter);
  return { status: 200, body: { trips } };
}

/** POST /api/ratings — создать рейтинг после поездки. */
export async function handleCreateRating(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const tripId = toPositiveInt(body.tripId);
  if (tripId === undefined) {
    return err(400, 'tripId обязателен (положительное целое)');
  }

  const rateeId = toPositiveInt(body.rateeId);
  if (rateeId === undefined) {
    return err(400, 'rateeId обязателен (положительное целое)');
  }

  const stars = toPositiveInt(body.stars);
  if (stars === undefined || stars < 1 || stars > 5) {
    return err(400, 'stars обязателен и должен быть от 1 до 5');
  }

  const tags = typeof body.tags === 'string' ? body.tags.trim() : null;
  const comment = typeof body.comment === 'string' ? body.comment.trim() : null;

  try {
    const result = await createRatingById(userId, { tripId, rateeId, stars, tags, comment });
    return { status: 201, body: { rating: result } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось создать рейтинг';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/** GET /api/trips/:id/bookings — список броней для поездки (ТОЛЬКО водитель поездки). */
export async function handleGetTripBookings(req: ApiRequest): Promise<ApiResponse> {
  // Резолвим внутренний id (cookie-сессия ИЛИ Telegram) — нужен для проверки владения.
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const tripId = toPositiveInt(req.params.id);
  if (tripId === undefined) {
    return err(400, 'Некорректный id поездки');
  }

  // Скоуп на владельца: брони (и телефоны пассажиров) видит только водитель поездки.
  const result = await getTripBookings(tripId, userId);
  if (!result.ok) {
    if (result.reason === 'not_found') {
      return err(404, 'Поездка не найдена');
    }
    return err(403, 'Доступ к броням только у водителя поездки');
  }
  return { status: 200, body: { bookings: result.bookings } };
}

/**
 * GET /api/trips/:id/participants — участники поездки (водитель + активные пассажиры).
 * Доступ у любого участника поездки (водитель ИЛИ пассажир с активной бронью) —
 * они видят профили друг друга. Только публичные поля; карточка ведёт в /users/:id/profile.
 */
export async function handleGetTripParticipants(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const tripId = toPositiveInt(req.params.id);
  if (tripId === undefined) {
    return err(400, 'Некорректный id поездки');
  }

  const result = await getTripParticipants(tripId, userId);
  if (!result.ok) {
    if (result.reason === 'not_found') {
      return err(404, 'Поездка не найдена');
    }
    return err(403, 'Список участников доступен только участникам поездки');
  }
  return { status: 200, body: { participants: result.participants } };
}

/** PATCH /api/bookings/:id — отменить бронь водителем. */
export async function handleCancelBooking(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const auth = authenticate(req, body.initData);
  if ('status' in auth) {
    return auth;
  }
  const { user } = auth;

  const bookingId = toPositiveInt(req.params.id);
  if (bookingId === undefined) {
    return err(400, 'Некорректный id брони');
  }

  const action = body.action;
  if (action !== 'cancel_by_driver') {
    return err(400, 'action должен быть "cancel_by_driver"');
  }

  try {
    const r = await cancelBookingByDriver(bookingId, user.id);

    // Fire-and-forget: уведомить пассажира об отмене его брони (in-app лента + Telegram)
    void notifyPassengerAboutBookingDecision({
      passengerId: r.passengerId,
      passengerTgUserId: r.passengerTgUserId,
      tripId: r.tripId,
      startTitle: r.startTitle,
      endTitle: r.endTitle,
      tripDate: r.tripDate,
      departureTime: r.departureTime,
      confirmed: false,
    });

    // В ответ — только публичные поля (без tg-id пассажира)
    const result = {
      bookingId: r.bookingId,
      tripId: r.tripId,
      seatsFreed: r.seatsFreed,
      newAvailable: r.newAvailable,
    };
    return { status: 200, body: { result } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось отменить бронь';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/**
 * POST /api/trips/:id/cancel — отменить всю поездку (только водитель поездки).
 * Отменяет поездку и все активные брони, уведомляет пассажиров (in-app + Telegram).
 */
export async function handleCancelTrip(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const auth = authenticate(req, body.initData ?? req.headers['x-telegram-init-data']);
  if ('status' in auth) {
    return auth;
  }
  const { user } = auth;

  const tripId = toPositiveInt(req.params.id);
  if (tripId === undefined) {
    return err(400, 'Некорректный id поездки');
  }

  try {
    const r = await cancelTripByDriver(tripId, user.id);

    // Fire-and-forget: уведомить всех пассажиров об отмене поездки
    void notifyPassengersAboutTripCancellation({
      tripId: r.tripId,
      startTitle: r.startTitle,
      endTitle: r.endTitle,
      tripDate: r.tripDate,
      departureTime: r.departureTime,
      passengers: r.passengers.map((p) => ({
        passengerId: p.passengerId,
        passengerTgUserId: p.passengerTgUserId,
      })),
    });

    return {
      status: 200,
      body: { result: { tripId: r.tripId, cancelledBookings: r.passengers.length } },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось отменить поездку';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/**
 * GET /api/me/template — получить/создать trip_template водителя для коридора.
 * Идемпотентно: если шаблон уже есть — вернуть, иначе создать дефолтный
 * (Брагино↔Центр, morning, 120 руб, 3 места). Аутентификация через initData
 * в заголовке X-Telegram-Init-Data с dev-bypass без BOT_TOKEN.
 */
export async function handleGetMyTemplate(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  try {
    const template = await getOrCreateDriverTemplateById(userId);
    return {
      status: 200,
      body: {
        id: template.id,
        start_point_id: template.start_point_id,
        end_point_id: template.end_point_id,
        time_slot: template.time_slot,
        price_rub: template.price_rub,
        seats_total: template.seats_total,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось получить шаблон';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/** GET /api/route-points — справочник точек коридора (для домена Заявки). */
export async function handleListRoutePoints(_req: ApiRequest): Promise<ApiResponse> {
  const points = await listRoutePoints();
  return { status: 200, body: { points } };
}

/**
 * GET /api/_debug/counts — диагностика наполнения БД (без ПДн).
 * Возвращает счётчики: route_points, users, trips, trips_today, demo_drivers.
 * Для проверки: на проде (без DEMO_SEED) trips_today=0, в dev (DEMO_SEED=true) > 0.
 */
export async function handleDebugCounts(_req: ApiRequest): Promise<ApiResponse> {
  const { getDebugCounts } = await import('./repo.ts');
  const counts = await getDebugCounts();
  return { status: 200, body: counts };
}

/**
 * Валидация серии/номера ВУ: формат 'NNNN ЛЛ NNNNNN' (4 цифры, 2 буквы рус, 6 цифр).
 * Возвращает нормализованную строку или null при ошибке.
 */
function validateSeriesNumber(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  // Формат: 4 цифры, пробел, 2 РУССКИЕ буквы, пробел, 6 цифр
  const re = /^(\d{4})\s([А-ЯЁ]{2})\s(\d{6})$/;
  const match = re.exec(cleaned);
  if (!match) {
    return null;
  }
  return `${match[1]} ${match[2]} ${match[3]}`;
}

/**
 * Валидация срока действия ВУ: формат 'MM/YYYY' или 'MM / YYYY', не истёк.
 * Возвращает нормализованную строку 'MM/YYYY' или null при ошибке.
 */
function validateValidUntil(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, '').trim();
  // Формат: MM/YYYY
  const re = /^(\d{2})\/(\d{4})$/;
  const match = re.exec(cleaned);
  if (!match) {
    return null;
  }
  const month = Number.parseInt(match[1], 10);
  const year = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) {
    return null;
  }
  // Проверка "не истёк": последний день месяца >= сегодня
  const lastDay = new Date(year, month, 0); // 0-й день следующего месяца = последний день текущего
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (lastDay < today) {
    return null;
  }
  return `${match[1]}/${match[2]}`;
}

/**
 * POST /api/me/license — отправить заявку на проверку ВУ (W1).
 * Аутентификация через initData (заголовок). Валидация серии/номера и срока.
 * Идемпотентно: повторная заявка обновляет существующую pending.
 */
export async function handleSubmitLicense(req: ApiRequest): Promise<ApiResponse> {
  const body = asRecord(req.body);

  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const rawSeries = typeof body.seriesNumber === 'string' ? body.seriesNumber : '';
  const rawValid = typeof body.validUntil === 'string' ? body.validUntil : '';

  const seriesNumber = validateSeriesNumber(rawSeries);
  if (seriesNumber === null) {
    return err(400, 'Неверный формат серии/номера ВУ. Ожидается: NNNN ЛЛ NNNNNN (4 цифры, 2 русские буквы, 6 цифр)');
  }

  const validUntil = validateValidUntil(rawValid);
  if (validUntil === null) {
    return err(400, 'Неверный формат или истёкший срок действия ВУ. Ожидается: MM/YYYY (не истёк)');
  }

  const driverProfile = await getUserProfileById(userId);
  const driverName = driverProfile?.name ?? 'Водитель';

  try {
    const result = await submitLicenseRequestById(userId, seriesNumber, validUntil);

    // Уведомить админа о заявке на модерацию (fire-and-forget, no-op без ADMIN_CHAT_ID)
    void notifyAdminAboutLicenseRequest({
      requestId: result.requestId,
      driverName,
      seriesNumber,
      validUntil,
    });

    return { status: 201, body: { request: result } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось отправить заявку';
    const status = message.includes('не найден') ? 404 : 400;
    return err(status, message);
  }
}

/**
 * GET /api/users/:id/profile — публичный профиль пользователя по внутреннему id.
 * Доступ для любого аутентифицированного принципала (cookie-сессия ИЛИ initData) —
 * через мост сессии, чтобы работало и в нативном приложении, и в Mini App.
 */
export async function handleGetUserProfile(req: ApiRequest): Promise<ApiResponse> {
  const principal = await resolveCurrentUserId(req);
  if (typeof principal !== 'number') {
    return principal;
  }

  const userId = toPositiveInt(req.params.id);
  if (userId === undefined) {
    return err(400, 'Некорректный id пользователя');
  }

  const profile = await getPublicUserProfile(userId);
  if (profile === null) {
    return err(404, 'Пользователь не найден');
  }

  return { status: 200, body: { profile } };
}

/**
 * GET /api/users/:id/reviews — отзывы о пользователе по внутреннему id.
 * Доступ для любого аутентифицированного принципала (cookie-сессия ИЛИ initData) —
 * через мост сессии, чтобы работало и в нативном приложении, и в Mini App.
 */
export async function handleGetUserReviews(req: ApiRequest): Promise<ApiResponse> {
  const principal = await resolveCurrentUserId(req);
  if (typeof principal !== 'number') {
    return principal;
  }

  const userId = toPositiveInt(req.params.id);
  if (userId === undefined) {
    return err(400, 'Некорректный id пользователя');
  }

  const reviews = await listUserReviews(userId);
  return { status: 200, body: { reviews } };
}

/**
 * GET /api/notifications — список уведомлений текущего пользователя.
 * Требует initData-auth (как остальные эндпоинты Mini App).
 */
export async function handleGetNotifications(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  // Лениво до-генерировать напоминания «оставьте отзыв» по завершённым поездкам (крона нет).
  // Best-effort: ошибка не должна ломать выдачу ленты.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { ensureRateRemindersById } = await import('./repo.ts');
    await ensureRateRemindersById(userId, today);
  } catch (e) {
    console.error('[handleGetNotifications] ensureRateReminders:', e);
  }

  const { listNotificationsById } = await import('./repo.ts');
  const notifications = await listNotificationsById(userId);
  return { status: 200, body: { notifications } };
}

/**
 * POST /api/notifications/read — пометить уведомление прочитанным.
 * Body: { notificationId: number }
 */
export async function handleMarkNotificationRead(req: ApiRequest): Promise<ApiResponse> {
  const userId = await resolveCurrentUserId(req);
  if (typeof userId !== 'number') {
    return userId;
  }

  const body = asRecord(req.body);
  const notificationId = toPositiveInt(body.notificationId);
  if (notificationId === undefined) {
    return err(400, 'Обязательно поле notificationId (целое положительное число)');
  }

  const { markNotificationReadById } = await import('./repo.ts');
  const success = await markNotificationReadById(notificationId, userId);
  if (!success) {
    return err(404, 'Уведомление не найдено или не принадлежит пользователю');
  }

  return { status: 200, body: { success: true } };
}
