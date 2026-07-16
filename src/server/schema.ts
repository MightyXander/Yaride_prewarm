/**
 * Схема БД и линейные миграции по версии (PostgreSQL, node-postgres).
 *
 * Минимальный срез модели данных, перенесённый из основного репозитория
 * MightyXander/Yaride (app/db_postgres.py) под MVP «Один туннель».
 *
 * Таблицы: users, route_points, trips, bookings, trip_templates, route_alerts
 * + служебная schema_version. Postgres-диалект: SERIAL/BIGINT PK, TIMESTAMPTZ,
 * REFERENCES, плейсхолдеры $1..$n, DOUBLE PRECISION для координат/рейтингов.
 * Инициализация идемпотентна (CREATE TABLE/INDEX IF NOT EXISTS).
 */

import type { Pool } from 'pg';

/** Текущая версия схемы кода prewarm-слоя данных. */
export const CURRENT_SCHEMA_VERSION = 19;

/** Полный bootstrap схемы для свежей БД (идемпотентно). */
const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    -- tg_user_id NULLABLE: браузерные аккаунты (email/пароль) Telegram-id не имеют.
    tg_user_id BIGINT UNIQUE,
    name TEXT NOT NULL,
    username TEXT,
    age INTEGER,
    phone TEXT,
    rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    trips_driver_count INTEGER NOT NULL DEFAULT 0,
    trips_passenger_count INTEGER NOT NULL DEFAULT 0,
    license_status TEXT NOT NULL DEFAULT 'none'
      CHECK (license_status IN ('none', 'pending', 'verified', 'rejected')),
    -- Пол пользователя (issue #447, фундамент женских поездок). 'unknown' —
    -- дефолт для Telegram-юзеров и старых строк; веб-регистрация требует male/female.
    sex TEXT NOT NULL DEFAULT 'unknown'
      CHECK (sex IN ('male', 'female', 'unknown')),
    -- Браузерная авторизация (issue #242): email/пароль + согласия 152-ФЗ.
    email TEXT,
    password_hash TEXT,
    first_name TEXT,
    last_name TEXT,
    pdn_consent_at TIMESTAMPTZ,
    pdn_consent_version TEXT,
    marketing_consent_at TIMESTAMPTZ,
    marketing_consent_version TEXT,
    -- Согласие с Публичной офертой (issue #234): отдельная версия/дата от pdn_consent_*,
    -- фиксируется вместе с ним при регистрации/онбординге, но может версионироваться
    -- независимо (Оферта и Политика ПДн — разные документы, см. src/lib/policy.ts).
    offer_consent_at TIMESTAMPTZ,
    offer_consent_version TEXT,
    -- SMS-подтверждение номера (issue #328): статус верификации телефона.
    -- Модуль включается ТОЛЬКО кредами SMSC_LOGIN/SMSC_PASSWORD в env — без них
    -- verificationEnabled=false и эти поля остаются false/NULL для всех.
    phone_verified BOOLEAN NOT NULL DEFAULT false,
    phone_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Инвариант «хотя бы один способ входа»: либо Telegram, либо email+пароль.
    CONSTRAINT users_login_method_check
      CHECK (tg_user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL))
  );

  -- Регистронезависимая уникальность email среди ВЕБ-аккаунтов (partial — NULL не конфликтуют).
  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
    ON users (lower(email)) WHERE email IS NOT NULL;
  -- ВАЖНО: уникальность username ТОЛЬКО среди веб-аккаунтов (password_hash IS NOT NULL).
  -- users.username хранит СНИМКИ Telegram-ников, среди которых исторически возможны
  -- регистровые дубли ('John' и 'john'); индекс на всех строках упал бы 23505 при
  -- создании и зациклил старт. Веб-юзер может взять ник, совпадающий с TG-снимком,
  -- но два веб-юзера один ник — нет. Условие должно совпадать с миграцией v7→v8.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
    ON users (lower(username)) WHERE password_hash IS NOT NULL;

  -- Сессии браузерной авторизации (opaque-токен хранится только как sha256-хеш).
  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  -- FCM push-токены устройств пользователя (issue #265). token уникален; при
  -- повторной регистрации/смене аккаунта строка переезжает (upsert по token).
  CREATE TABLE IF NOT EXISTS push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_token ON push_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

  CREATE TABLE IF NOT EXISTS route_points (
    id SERIAL PRIMARY KEY,
    locality TEXT NOT NULL,
    district TEXT NOT NULL DEFAULT '',
    admin_area TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    kind TEXT NOT NULL DEFAULT 'stop' CHECK (kind IN ('stop', 'locality')),
    -- Фиксированные точки сбора/финиша (issue #331): группировка остановок под
    -- районом-анкером. NULL у самих анкеров-районов (kind='locality'); у
    -- конкретной остановки (kind='stop') указывает на её анкер. Группа точки
    -- для сравнений (матчинг, фильтры листинга) = COALESCE(parent_point_id, id).
    parent_point_id INTEGER REFERENCES route_points(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_route_point
    ON route_points(locality, district, admin_area, title);

  CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    start_point_id INTEGER NOT NULL REFERENCES route_points(id),
    end_point_id INTEGER NOT NULL REFERENCES route_points(id),
    trip_date TEXT NOT NULL DEFAULT '',
    departure_time TEXT NOT NULL DEFAULT '',
    time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'evening')),
    price_rub INTEGER NOT NULL,
    seats_total INTEGER NOT NULL,
    seats_booked INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    car_model TEXT,
    car_color TEXT,
    plate TEXT,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trips_status_date_route
    ON trips(status, trip_date, start_point_id, end_point_id);

  CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id),
    passenger_id INTEGER NOT NULL REFERENCES users(id),
    seats INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'cancelled_by_passenger', 'cancelled_by_driver')),
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMPTZ,
    UNIQUE(trip_id, passenger_id)
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_trip_status ON bookings(trip_id, status);
  CREATE INDEX IF NOT EXISTS idx_bookings_passenger_status ON bookings(passenger_id, status);

  CREATE TABLE IF NOT EXISTS trip_templates (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    start_point_id INTEGER NOT NULL REFERENCES route_points(id),
    end_point_id INTEGER NOT NULL REFERENCES route_points(id),
    time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'evening')),
    price_rub INTEGER NOT NULL,
    seats_total INTEGER NOT NULL,
    comment TEXT,
    car_color TEXT,
    plate TEXT,
    schedule_days TEXT,
    schedule_time TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trip_templates_driver ON trip_templates(driver_id);

  CREATE TABLE IF NOT EXISTS route_alerts (
    id SERIAL PRIMARY KEY,
    passenger_id INTEGER NOT NULL REFERENCES users(id),
    from_point_id INTEGER NOT NULL REFERENCES route_points(id),
    to_point_id INTEGER NOT NULL REFERENCES route_points(id),
    desired_date TEXT NOT NULL,
    desired_time TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'notified', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_route_alerts_passenger ON route_alerts(passenger_id);
  CREATE INDEX IF NOT EXISTS idx_route_alerts_route
    ON route_alerts(from_point_id, to_point_id, desired_date);
  CREATE INDEX IF NOT EXISTS idx_route_alerts_status ON route_alerts(status);

  CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id),
    rater_id INTEGER NOT NULL REFERENCES users(id),
    ratee_id INTEGER NOT NULL REFERENCES users(id),
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    tags TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trip_id, rater_id, ratee_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ratings_trip ON ratings(trip_id);
  CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);

  CREATE TABLE IF NOT EXISTS cars (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    model TEXT NOT NULL,
    color TEXT,
    plate TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_cars_driver ON cars(driver_id);

  CREATE TABLE IF NOT EXISTS license_requests (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    series_number TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewer TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_license_requests_driver ON license_requests(driver_id);
  CREATE INDEX IF NOT EXISTS idx_license_requests_status ON license_requests(status);

  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('booking', 'booking_confirmed', 'cancel', 'rate_reminder', 'trip_new', 'license_approved', 'license_rejected')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    -- Момент простановки read=TRUE (issue #337) — точка отсчёта для ленивого
    -- авто-архива через 2 дня. NULL пока не прочитано.
    read_at TIMESTAMPTZ,
    -- Прочитанное уведомление, «отлежавшее» read_at 2+ дня, помечается архивным
    -- (issue #337) и перестаёт попадать в ленту (listNotificationsById фильтрует
    -- NOT archived). Крона нет — простановка ленивая, на запросе GET /api/notifications.
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    ref_trip_id INTEGER REFERENCES trips(id),
    ref_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

  -- Слой метрик ликвидности (CEO Council): захват событий воронки поиск →
  -- бронь / заявка-алерт. user_id NULLABLE (событие может случиться до JIT-
  -- резолва профиля), corridor — "<startPointId>-<endPointId>" либо NULL,
  -- props — свободная JSONB-полезная нагрузка (result_count, trip_id, alert_id...).
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type TEXT NOT NULL,
    corridor TEXT,
    props JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_corridor_created ON events(corridor, created_at);

  -- SMS-подтверждение номера (issue #328): активные коды подтверждения.
  -- Хранится sha256-хэш кода (не сам код). Один пользователь — обычно одна
  -- активная строка (старые коды удаляются при выпуске нового, см. repo/sms-verification.ts).
  CREATE TABLE IF NOT EXISTS phone_verification_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_user ON phone_verification_codes(user_id);

  -- Настройки безопасности + доверенный контакт (issue #344, срез 1 из #323).
  -- Одна строка на пользователя (SafetyScreen: три тумблера + инлайн-форма
  -- контакта). trusted_name/trusted_phone NULLABLE — оба NULL, если контакт не
  -- задан; PUT с trustedContact:null удаляет контакт (пишет NULL/NULL).
  CREATE TABLE IF NOT EXISTS safety_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    sos_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_share BOOLEAN NOT NULL DEFAULT false,
    women_only BOOLEAN NOT NULL DEFAULT true,
    trusted_name TEXT,
    trusted_phone TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Привязка Telegram из профиля (issue #401): одноразовые токены deep-link
  -- t.me/<бот>?start=link_<токен>. В БД хранится только sha256-хэш токена (тот
  -- же приём, что sessions.token_hash). TTL 10 минут, одноразовый (used_at).
  CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_link_tokens_hash ON telegram_link_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user ON telegram_link_tokens(user_id, created_at);
`;

/**
 * Применить одну линейную миграцию from_v → to_v.
 * v1→v2: добавление таблицы ratings + пересчёт агрегатов users.rating_avg/rating_count.
 * v2→v3: добавление car_color TEXT NULL, plate TEXT NULL в trips и trip_templates.
 * v3→v4: добавление таблицы license_requests (модерация ВУ).
 * v4→v5: добавление таблицы notifications (события для лент уведомлений).
 * v5→v6: добавление таблицы cars (машины водителя) + колонки trips.car_model.
 * v6→v7: расширение notifications.type — добавлен тип 'trip_new' (поездка по маршруту пассажира).
 * v7→v8: бэкафилл денормализованных счётчиков профиля (#243) — пересчёт
 *        trips_driver_count/trips_passenger_count и rating_avg/rating_count из источников.
 * v8→v9: браузерная авторизация (issue #242) — tg_user_id NULLABLE, поля email/пароль/
 *        имя/согласия в users, уникальные индексы lower(email)/lower(username),
 *        CHECK «способ входа», таблица sessions. Безопасно для прод-БД (только ADD/ALTER).
 * v9→v10: FCM push-токены (issue #265) — таблица push_tokens.
 * v10→v11: расширение notifications.type — типы решения модерации ВУ
 *        ('license_approved' / 'license_rejected'), чтобы водитель видел вердикт в ленте.
 * v12→v13: слой метрик ликвидности (CEO Council) — таблица events (захват
 *        событий воронки search/booking_created/alert_created) + индексы
 *        по (type, created_at) и (corridor, created_at).
 * v13→v14: SMS-подтверждение номера (issue #328) — users.phone_verified/
 *        phone_verified_at + таблица phone_verification_codes. Модуль
 *        включается только кредами SMSC_LOGIN/SMSC_PASSWORD в env (no-op без них).
 * v14→v15: фиксированные точки сбора/финиша (issue #331) — route_points.parent_point_id
 *        (группировка остановок под анкером-районом); анкеры «Брагино»/«Центр»
 *        переводятся в kind='locality'; вставляются 9 конкретных остановок
 *        (4 в Брагино, 5 в центре) с parent_point_id на свой анкер. Идемпотентно:
 *        UPDATE по точному natural-key анкеров + INSERT ... ON CONFLICT DO NOTHING
 *        по uq_route_point. Существующие trips/route_alerts НЕ мигрируются —
 *        их ссылки на анкеры остаются валидными (группа анкера = сам анкер).
 * v15→v16: авто-архив уведомлений (issue #337) — notifications.read_at TIMESTAMPTZ
 *        (момент простановки read=TRUE) + notifications.archived BOOLEAN DEFAULT
 *        FALSE; бэкфилл read_at = created_at для уже прочитанных строк (иначе
 *        старые прочитанные никогда бы не заархивировались лениво). Аддитивно.
 * v16→v17: настройки безопасности + доверенный контакт (issue #344, срез 1 из
 *        #323) — новая таблица safety_settings (одна строка на пользователя,
 *        UPSERT по user_id). Аддитивно, никаких существующих таблиц не трогает.
 * v17→v18: привязка Telegram из профиля (issue #401) — новая таблица
 *        telegram_link_tokens (одноразовые deep-link токены /start link_...).
 *        Аддитивно, никаких существующих таблиц не трогает.
 * v18→v19: пол пользователя (issue #447, фундамент женских поездок) —
 *        users.sex TEXT NOT NULL DEFAULT 'unknown' CHECK IN (male/female/unknown).
 *        Аддитивно: колонка с дефолтом, существующие строки получают 'unknown'.
 */
async function applyMigration(pool: Pool, fromV: number, toV: number): Promise<void> {
  if (fromV === 1 && toV === 2) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id),
        rater_id INTEGER NOT NULL REFERENCES users(id),
        ratee_id INTEGER NOT NULL REFERENCES users(id),
        stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
        tags TEXT,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(trip_id, rater_id, ratee_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ratings_trip ON ratings(trip_id);
      CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);
    `);
    return;
  }
  if (fromV === 2 && toV === 3) {
    await pool.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_color TEXT;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS plate TEXT;
      ALTER TABLE trip_templates ADD COLUMN IF NOT EXISTS car_color TEXT;
      ALTER TABLE trip_templates ADD COLUMN IF NOT EXISTS plate TEXT;
    `);
    return;
  }
  if (fromV === 3 && toV === 4) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_requests (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL REFERENCES users(id),
        series_number TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMPTZ,
        reviewer TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_license_requests_driver ON license_requests(driver_id);
      CREATE INDEX IF NOT EXISTS idx_license_requests_status ON license_requests(status);
    `);
    return;
  }
  if (fromV === 4 && toV === 5) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK (type IN ('booking', 'booking_confirmed', 'cancel', 'rate_reminder')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        ref_trip_id INTEGER REFERENCES trips(id),
        ref_user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
    `);
    return;
  }
  if (fromV === 5 && toV === 6) {
    await pool.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_model TEXT;

      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL REFERENCES users(id),
        model TEXT NOT NULL,
        color TEXT,
        plate TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cars_driver ON cars(driver_id);
    `);
    return;
  }
  if (fromV === 6 && toV === 7) {
    // Расширяем CHECK notifications.type типом 'trip_new'. Имя inline-констрейнта
    // в Postgres детерминировано — notifications_type_check.
    await pool.query(`
      ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
      ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
        CHECK (type IN ('booking', 'booking_confirmed', 'cancel', 'rate_reminder', 'trip_new'));
    `);
    return;
  }
  if (fromV === 7 && toV === 8) {
    // Бэкафилл денормализованных счётчиков профиля из источников (#243).
    // Существующие пользователи имели trips_driver_count/trips_passenger_count = 0,
    // хотя в trips/bookings были реальные поездки/брони. Пересчитываем разом.
    // rating_avg/rating_count тоже пересчитываем из ratings для консистентности
    // исторических данных. Идемпотентно (чистый пересчёт из источников).
    await pool.query(`
      UPDATE users u SET
        trips_driver_count = (
          SELECT COUNT(*) FROM trips t
          WHERE t.driver_id = u.id AND t.status <> 'cancelled'
        ),
        trips_passenger_count = (
          SELECT COUNT(*) FROM bookings b
          WHERE b.passenger_id = u.id AND b.status = 'active'
        ),
        rating_avg = (
          SELECT COALESCE(AVG(r.stars), 0.0) FROM ratings r WHERE r.ratee_id = u.id
        ),
        rating_count = (
          SELECT COUNT(*) FROM ratings r WHERE r.ratee_id = u.id
        );
    `);
    return;
  }
  if (fromV === 8 && toV === 9) {
    // Браузерная авторизация (issue #242). Все шаги идемпотентны и аддитивны,
    // поэтому безопасно применяются на проде при старте.
    //
    // tg_user_id → NULLABLE: существующие Telegram-строки этим не затрагиваются
    // (UNIQUE сохраняется). Новые колонки добавляются IF NOT EXISTS.
    await pool.query(`
      ALTER TABLE users ALTER COLUMN tg_user_id DROP NOT NULL;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pdn_consent_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pdn_consent_version TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_version TEXT;

      -- email: регистронезависимая уникальность (partial WHERE NOT NULL — NULL не конфликтуют).
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
        ON users (lower(email)) WHERE email IS NOT NULL;
      -- username: уникальность ТОЛЬКО среди ВЕБ-аккаунтов (password_hash IS NOT NULL).
      -- users.username — это снимки Telegram-ников, среди которых исторически возможны
      -- регистровые дубли ('John'/'john'); индекс на лету по всем строкам упал бы 23505
      -- и зациклил старт прода. На текущем проде password_hash везде NULL → индекс пуст →
      -- создаётся гарантированно. Условие совпадает с bootstrap-схемой и проверкой в repo.ts.
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
        ON users (lower(username)) WHERE password_hash IS NOT NULL;

      -- CHECK навешиваем идемпотентно (DROP IF EXISTS + ADD), как в миграции v6→v7.
      -- Существующие Telegram-строки удовлетворяют (tg_user_id IS NOT NULL).
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_login_method_check;
      ALTER TABLE users ADD CONSTRAINT users_login_method_check
        CHECK (tg_user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL));

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `);
    return;
  }
  if (fromV === 11 && toV === 12) {
    // Согласие с Публичной офертой (issue #234, закрытие блокера 152-ФЗ для
    // Telegram-юзеров): колонки аддитивны/идемпотентны, как pdn_consent_* в v8→v9.
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS offer_consent_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS offer_consent_version TEXT;
    `);
    return;
  }
  if (fromV === 10 && toV === 11) {
    // Расширяем CHECK notifications.type типами решения по ВУ
    // ('license_approved' / 'license_rejected') — водитель видит решение модерации
    // в ленте уведомлений. Идемпотентно (DROP IF EXISTS + ADD), как v6→v7.
    await pool.query(`
      ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
      ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
        CHECK (type IN ('booking', 'booking_confirmed', 'cancel', 'rate_reminder', 'trip_new', 'license_approved', 'license_rejected'));
    `);
    return;
  }
  if (fromV === 12 && toV === 13) {
    // Слой метрик ликвидности (CEO Council, «мерить НЕМЕДЛЕННО»). Аддитивно —
    // новая таблица, ничего существующего не трогает.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type TEXT NOT NULL,
        corridor TEXT,
        props JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at);
      CREATE INDEX IF NOT EXISTS idx_events_corridor_created ON events(corridor, created_at);
    `);
    return;
  }
  if (fromV === 9 && toV === 10) {
    // FCM push-токены (issue #265). Аддитивно/идемпотентно.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'android',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_token ON push_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
    `);
    return;
  }
  if (fromV === 13 && toV === 14) {
    // SMS-подтверждение номера (issue #328). Аддитивно — новые колонки users
    // (дефолт false/NULL сохраняет текущее поведение для всех существующих
    // строк) + новая таблица кодов подтверждения.
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS phone_verification_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        phone TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_user ON phone_verification_codes(user_id);
    `);
    return;
  }
  if (fromV === 14 && toV === 15) {
    // Фиксированные точки сбора/финиша (issue #331). Аддитивно:
    // 1) новая колонка parent_point_id (NULL у анкеров-районов, id анкера у остановки);
    // 2) существующие анкеры «Брагино»/«Центр» переводятся из kind='stop' в kind='locality'
    //    (их id НЕ меняются — ссылки в trips/trip_templates/route_alerts остаются валидными,
    //    группа анкера = COALESCE(NULL, id) = сам id, как и раньше);
    // 3) 9 конкретных остановок (4 в Брагино, 5 в центре) вставляются идемпотентно
    //    (ON CONFLICT DO NOTHING по uq_route_point(locality, district, admin_area, title))
    //    с parent_point_id, найденным подзапросом по natural-key анкера.
    await pool.query(`
      ALTER TABLE route_points ADD COLUMN IF NOT EXISTS parent_point_id INTEGER REFERENCES route_points(id);

      UPDATE route_points SET kind = 'locality'
        WHERE locality = 'Ярославль' AND district = 'Дзержинский район' AND admin_area = '' AND title = 'Брагино';
      UPDATE route_points SET kind = 'locality'
        WHERE locality = 'Ярославль' AND district = 'Кировский район' AND admin_area = '' AND title = 'Центр';

      -- Остановки сбора в Брагино (группа — анкер «Брагино»).
      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Дзержинский район', '', 'ТРК Альтаир', 57.686, 39.772, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Дзержинский район' AND admin_area = '' AND title = 'Брагино')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Дзержинский район', '', 'ТЦ Космос', 57.665, 39.809, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Дзержинский район' AND admin_area = '' AND title = 'Брагино')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Дзержинский район', '', 'Проспект Дзержинского', 57.672, 39.793, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Дзержинский район' AND admin_area = '' AND title = 'Брагино')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Дзержинский район', '', 'ТРЦ РИО', 57.652, 39.836, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Дзержинский район' AND admin_area = '' AND title = 'Брагино')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      -- Остановки финиша в центре (группа — анкер «Центр»).
      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Кировский район', '', 'Шинный завод', 57.601, 39.860, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Кировский район' AND admin_area = '' AND title = 'Центр')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Кировский район', '', 'Площадь Богоявления', 57.629, 39.896, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Кировский район' AND admin_area = '' AND title = 'Центр')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Кировский район', '', 'Волковский театр', 57.627, 39.898, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Кировский район' AND admin_area = '' AND title = 'Центр')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Кировский район', '', 'ТЦ Гигант', 57.615, 39.855, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Кировский район' AND admin_area = '' AND title = 'Центр')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;

      INSERT INTO route_points(locality, district, admin_area, title, latitude, longitude, kind, parent_point_id)
      SELECT 'Ярославль', 'Кировский район', '', 'Ярославль-Главный', 57.611, 39.835, 'stop',
             (SELECT id FROM route_points WHERE locality = 'Ярославль' AND district = 'Кировский район' AND admin_area = '' AND title = 'Центр')
      ON CONFLICT (locality, district, admin_area, title) DO NOTHING;
    `);
    return;
  }
  if (fromV === 15 && toV === 16) {
    // Авто-архив уведомлений (issue #337). Аддитивно: новые колонки с дефолтами
    // не трогают существующее поведение. Бэкфилл read_at — иначе уведомления,
    // прочитанные ДО этой миграции, никогда не получили бы read_at и не
    // заархивировались бы ленивым UPDATE в handleGetNotifications.
    await pool.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

      UPDATE notifications SET read_at = created_at WHERE read = TRUE AND read_at IS NULL;
    `);
    return;
  }
  if (fromV === 16 && toV === 17) {
    // Настройки безопасности + доверенный контакт (issue #344, срез 1 из #323).
    // Аддитивно — новая таблица, ничего существующего не трогает.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS safety_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id),
        sos_enabled BOOLEAN NOT NULL DEFAULT true,
        auto_share BOOLEAN NOT NULL DEFAULT false,
        women_only BOOLEAN NOT NULL DEFAULT true,
        trusted_name TEXT,
        trusted_phone TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return;
  }
  if (fromV === 17 && toV === 18) {
    // Привязка Telegram из профиля (issue #401). Аддитивно — новая таблица
    // одноразовых токенов deep-link, ничего существующего не трогает.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_link_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_link_tokens_hash ON telegram_link_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user ON telegram_link_tokens(user_id, created_at);
    `);
    return;
  }
  if (fromV === 18 && toV === 19) {
    // Пол пользователя (issue #447). Идемпотентно (ADD COLUMN IF NOT EXISTS);
    // NOT NULL DEFAULT 'unknown' безопасно бэкфилит существующие строки.
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS sex TEXT NOT NULL DEFAULT 'unknown'
        CHECK (sex IN ('male', 'female', 'unknown'));
    `);
    return;
  }
  throw new Error(`No migration defined from v${fromV} to v${toV}`);
}

/**
 * Создать схему с нуля или прогнать линейные миграции до текущей версии.
 * Свежая БД получает полный bootstrap; существующая мигрирует шаг за шагом.
 * Идемпотентно: bootstrap из CREATE ... IF NOT EXISTS.
 */
export async function initSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    )
  `);

  const res = await pool.query<{ version: number }>(
    'SELECT version FROM schema_version WHERE id = 1',
  );

  if (res.rows.length === 0) {
    await pool.query(BOOTSTRAP_SQL);
    await pool.query(
      'INSERT INTO schema_version(id, version) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
      [CURRENT_SCHEMA_VERSION],
    );
    return;
  }

  let v = res.rows[0].version;
  while (v < CURRENT_SCHEMA_VERSION) {
    const next = v + 1;
    await applyMigration(pool, v, next);
    await pool.query('UPDATE schema_version SET version = $1 WHERE id = 1', [next]);
    v = next;
  }
}
