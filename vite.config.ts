import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ViteDevServer } from 'vite'

// Публичная страница «Политика обработки персональных данных» по «красивому» URL /privacy.
// В проде её отдаёт Express (route /privacy → dist/privacy.html). В dev Vite по умолчанию
// отдаёт public/privacy.html только по /privacy.html, поэтому здесь маппим /privacy на файл
// напрямую (без зависимости от порядка внутренних middleware Vite).
function privacyPagePlugin() {
  const file = fileURLToPath(new URL('./public/privacy.html', import.meta.url));
  return {
    name: 'privacy-page',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname === '/privacy' || pathname === '/privacy/') {
          try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(readFileSync(file, 'utf-8'));
            return;
          } catch {
            // если файл не найден — отдать обычный поток обработки (404 Vite)
          }
        }
        next();
      });
    },
  };
}

// Публичная страница «Публичная оферта» по «красивому» URL /offer — тот же приём,
// что и privacyPagePlugin выше (issue #234), только для public/offer.html.
function offerPagePlugin() {
  const file = fileURLToPath(new URL('./public/offer.html', import.meta.url));
  return {
    name: 'offer-page',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname === '/offer' || pathname === '/offer/') {
          try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(readFileSync(file, 'utf-8'));
            return;
          } catch {
            // если файл не найден — отдать обычный поток обработки (404 Vite)
          }
        }
        next();
      });
    },
  };
}

// Mock API middleware для QA (когда backend недоступен)
function mockApiPlugin() {
  return {
    name: 'mock-api',
    configureServer(server: ViteDevServer) {
      // In-memory машины водителя для mock-режима: переживают между запросами,
      // POST добавляет в список (как реальный backend в server.js / src/server).
      const mockCars: { id: number; model: string; color: string | null; plate: string | null }[] = [
        { id: 1, model: 'Hyundai Solaris', color: 'белый', plate: 'Е456КХ' },
      ];

      // In-memory отслеживание уже отправленных оценок (issue #354): ключ `${tripId}:${rateeId}`.
      // Повторный POST /ratings для той же пары → 409 already_rated; rated_by_me в
      // GET /me/trips и GET /trips/:id/participants отражает это состояние между запросами.
      const mockRatedPairs = new Set<string>();

      // In-memory заявки-алерты (issue #321): переживают между запросами, чтобы
      // POST /api/alerts → GET /api/me/alerts → DELETE /api/alerts/:id вели себя
      // как реальный backend (route_alerts). Точки маршрута — те же id, что
      // GET /api/route-points ниже (1 — Брагино, 2 — Центр).
      const mockAlertPoints: Record<number, string> = {
        1: 'Брагино, ул. Урицкого, 12',
        2: 'Центр, пл. Волкова',
      };
      const mockAlertTomorrow = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      })();
      const mockAlerts: {
        id: number; fromPointId: number; toPointId: number;
        desiredDate: string; desiredTime: string | null; status: string; createdAt: string;
      }[] = [
        { id: 1, fromPointId: 1, toPointId: 2, desiredDate: mockAlertTomorrow, desiredTime: '08:00', status: 'active', createdAt: new Date().toISOString() },
      ];
      let mockAlertSeq = mockAlerts.reduce((max, a) => Math.max(max, a.id), 0) + 1;

      // In-memory лента уведомлений (read-флаг переживает POST /notifications/read).
      // created_at вычисляется на лету из minutesAgo, чтобы относительное время не «протухало».
      // readAt/archived (issue #337) зеркалят read_at/archived реальной схемы: у изначально
      // прочитанных строк readAt проставлен «в момент создания» (как бэкфилл read_at=created_at
      // в миграции v15→v16); лениво архивируются в GET, если read_at «отлежал» 2+ дня.
      const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
      const mockNotifications: {
        id: number; type: 'booking' | 'booking_confirmed' | 'cancel' | 'rate_reminder' | 'trip_new';
        title: string; body: string; read: boolean;
        ref_trip_id: number | null; ref_user_id: number | null; minutesAgo: number;
        readAt: number | null; archived: boolean;
      }[] = [
        { id: 1, type: 'booking_confirmed', title: 'Бронь подтверждена', body: 'Андрей К. подтвердил вашу бронь на 07:40, Брагино → Центр.', read: false, ref_trip_id: 1, ref_user_id: 101, minutesAgo: 8, readAt: null, archived: false },
        { id: 2, type: 'booking', title: 'Новая бронь', body: 'Анна С. забронировала место в вашей поездке 07:40.', read: false, ref_trip_id: 1, ref_user_id: 500, minutesAgo: 95, readAt: null, archived: false },
        { id: 3, type: 'rate_reminder', title: 'Оцените поездку', body: 'Как прошла поездка с Мариной С.? Оставьте оценку.', read: true, ref_trip_id: 6, ref_user_id: 102, minutesAgo: 1500, readAt: Date.now() - 1500 * 60000, archived: false },
        { id: 4, type: 'cancel', title: 'Поездка отменена', body: 'Олег В. отменил поездку на 18:05. Бронь снята.', read: true, ref_trip_id: 4, ref_user_id: 103, minutesAgo: 4400, readAt: Date.now() - 4400 * 60000, archived: false },
        { id: 5, type: 'trip_new', title: 'Поездка по вашему маршруту', body: 'По вашему маршруту Брагино → Центр появилась поездка на завтра в 08:10.', read: false, ref_trip_id: 2, ref_user_id: 102, minutesAgo: 20, readAt: null, archived: false },
      ];

      // Публичные профили известных водителей (id из мок-поездок) + fallback в хендлере.
      const mockUserProfiles: Record<number, { name: string; age: number | null; trips_count: number; rating: number; rating_count: number; joined_at: string; is_driver: boolean; license_verified: boolean }> = {
        101: { name: 'Андрей К.', age: 34, trips_count: 37, rating: 4.9, rating_count: 15, joined_at: '2024-05-10T10:00:00Z', is_driver: true, license_verified: true },
        102: { name: 'Марина С.', age: 29, trips_count: 12, rating: 5.0, rating_count: 8, joined_at: '2024-11-02T10:00:00Z', is_driver: true, license_verified: true },
        103: { name: 'Олег В.', age: 35, trips_count: 43, rating: 4.8, rating_count: 20, joined_at: '2023-09-15T10:00:00Z', is_driver: true, license_verified: true },
        500: { name: 'Анна С.', age: 27, trips_count: 18, rating: 4.9, rating_count: 11, joined_at: '2025-01-20T10:00:00Z', is_driver: false, license_verified: false },
      };

      // Отзывы (общие для мок-режима; created_at → «месяц год»).
      const mockReviews: { author_id: number; author_name: string; stars: number; comment: string | null; tags: string | null; created_at: string }[] = [
        { author_id: 201, author_name: 'Ирина М.', stars: 5, comment: 'Комфортная поездка, приехали вовремя. Спасибо!', tags: 'Пунктуальный,Вежливый', created_at: '2026-05-18T08:00:00Z' },
        { author_id: 202, author_name: 'Дмитрий П.', stars: 5, comment: 'Аккуратное вождение, приятная музыка.', tags: 'Аккуратный', created_at: '2026-04-02T08:00:00Z' },
        { author_id: 203, author_name: 'Сергей Т.', stars: 4, comment: null, tags: null, created_at: '2026-02-11T08:00:00Z' },
      ];

      // In-memory браузерная авторизация (#242) для dev/QA без backend.
      // Cookie yaride_session ставится так же, как реальный сервер (httpOnly).
      const mockAuthUsers: {
        id: number; email: string; password: string; username: string;
        firstName: string; lastName: string; name: string; sex: 'male' | 'female' | 'unknown';
      }[] = [];
      const mockSessions = new Map<string, number>(); // token → userId
      let mockUserSeq = 1000;

      // In-memory телефон текущего пользователя (#267). Префилл и сохранение
      // переживают между запросами в dev/QA без backend. Нормализация повторяет
      // серверную: 8/+7/7 + 10 цифр (оператор «9») → +7XXXXXXXXXX, иначе null.
      let mockPhone: string | null = null;
      // SMS-подтверждение номера (#328): в dev-моке модуль ВСЕГДА "сконфигурирован"
      // (verificationEnabled=true), код подтверждения всегда '1234' — без реального
      // SMSC.ru. verified сбрасывается при смене номера, как на реальном бэке.
      let mockPhoneVerified = false;
      const MOCK_VERIFICATION_CODE = '1234';
      // Зарезервированный «занятый» номер (issue #390): имитирует номер, уже
      // подтверждённый ДРУГИМ аккаунтом — save/send-code должны отдавать 409
      // phone_taken, как реальные хендлеры (findVerifiedUserByPhone).
      const MOCK_TAKEN_PHONE = '+79990000001'; // +7 999 000-00-01
      // In-memory статус входа по email текущего (TG) пользователя (#273).
      // Имитирует users-строку с tg_user_id и без пароля: username — снимок TG-ника.
      const mockCredentials: { hasPassword: boolean; email: string | null; username: string | null } = {
        hasPassword: false,
        email: null,
        username: 'tg_snapshot',
      };
      // In-memory согласие с Политикой ПДн/Офертой текущего (TG) пользователя (#234).
      // null-версии → ConsentGate в IntroScreen должен показать шаг согласия;
      // после POST /api/me/consent переживает между запросами, как mockPhone/mockCredentials.
      let mockConsent: { pdnConsentVersion: string | null; offerConsentVersion: string | null } = {
        pdnConsentVersion: null,
        offerConsentVersion: null,
      };
      // Настройки безопасности + доверенный контакт (#344, срез 1 из #323).
      // Дефолты совпадают с реальным бэком (нет строки в safety_settings).
      let mockSafety: {
        sosEnabled: boolean;
        autoShare: boolean;
        womenOnly: boolean;
        trustedContact: { name: string; phone: string } | null;
        sex: 'male' | 'female' | 'unknown';
      } = {
        sosEnabled: true,
        autoShare: false,
        womenOnly: true,
        trustedContact: null,
        sex: 'unknown',
      };
      // Привязка Telegram из профиля (#401): статус привязки текущего аккаунта.
      // Стартует false (CTA-бейдж виден); POST /me/telegram-link-token имитирует
      // «юзер дошёл до бота» и через ~6с переводит в true — так тестируется
      // поллинг перехода в «Telegram подключён» без реального бота.
      let mockTgLinked = false;
      // Личные данные профиля (#455): источник GET /me/personal и база дельта-
      // фильтра POST /me/personal/request. Пол берётся из mockSafety.sex (в реале
      // sex живёт в users.sex и пишется через PUT /me/safety).
      let mockPersonal: {
        username: string | null;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        birth_date: string | null;
      } = {
        username: 'mightyxander',
        email: 'me@yaride.dev',
        first_name: 'Тест',
        last_name: 'Пользователь',
        birth_date: '1994-03-15',
      };
      // Активная заявка на изменение (#455). POST заменяет прежнюю (как реальный
      // createOrReplacePendingRequest); null = заявки нет.
      let mockPending: { id: number; payload: Record<string, unknown>; status: string; created_at: string } | null = null;
      let mockPendingSeq = 5000;
      // Зарезервированные «занятые» ник/email — имитируют чужой аккаунт → 409.
      const MOCK_TAKEN_USERNAME = 'taken_user';
      const MOCK_TAKEN_EMAIL = 'taken@yaride.dev';
      const normalizeBirthDateMock = (raw: string): string | null => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (m === null) return null;
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        const dt = new Date(Date.UTC(year, month - 1, day));
        if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
        const now = new Date();
        if (dt.getTime() > now.getTime()) return null;
        const oldest = Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate());
        if (dt.getTime() < oldest) return null;
        return `${m[1]}-${m[2]}-${m[3]}`;
      };
      const normalizeRuPhoneMock = (raw: string): string | null => {
        const digits = String(raw).replace(/\D/g, '');
        let national: string;
        if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) national = digits.slice(1);
        else if (digits.length === 10) national = digits;
        else return null;
        if (national.length !== 10 || national[0] !== '9') return null;
        return `+7${national}`;
      };

      const parseCookieHeader = (header: string | undefined): Record<string, string> => {
        const out: Record<string, string> = {};
        if (!header) return out;
        for (const part of header.split(';')) {
          const i = part.indexOf('=');
          if (i < 0) continue;
          out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
        }
        return out;
      };
      const mockUserPublic = (u: typeof mockAuthUsers[number]) => ({
        id: u.id, name: u.name, email: u.email, username: u.username,
        first_name: u.firstName, last_name: u.lastName, sex: u.sex,
      });

      server.middlewares.use('/api', (req, res, next) => {
        // Если backend запущен — пропустить к proxy
        if (process.env.USE_REAL_API === 'true') {
          return next();
        }

        const url = new URL(req.url || '', 'http://localhost');
        const pathname = url.pathname.replace(/^\/api/, '');
        const method = req.method || 'GET';

        // Для QA скелетонов и ошибок: query-параметры
        const forceEmpty = url.searchParams.get('mock_empty') === 'true';
        const forceError = url.searchParams.get('mock_error') === 'true';
        const delay = url.searchParams.get('delay');

        const sendJson = (data: any, statusCode = 200) => {
          if (forceError) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Mock error for QA' }));
            return;
          }

          const send = () => {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          };

          if (delay) {
            setTimeout(send, parseInt(delay));
          } else {
            send();
          }
        };

        // GET /api/trips
        if (method === 'GET' && pathname.startsWith('/trips') && !pathname.includes('/bookings')) {
          const tripIdMatch = pathname.match(/^\/trips\/(\d+)$/);

          if (tripIdMatch) {
            // GET /api/trips/:id
            const tripId = parseInt(tripIdMatch[1]);
            const tripCard = {
              id: tripId,
              driver_id: 101,
              time_slot: 'morning',
              trip_date: '2026-06-26',
              departure_time: '07:40:00',
              price_rub: 80,
              seats_total: 3,
              seats_booked: 1,
              seats_available: 2,
              status: 'open',
              start_point_id: 1,
              end_point_id: 2,
              start_title: 'Брагино, ул. Урицкого, 12',
              end_title: 'Центр, пл. Волкова',
              driver_name: 'Андрей К.',
              driver_age: 34,
              driver_rating: 4.9,
              driver_rating_count: 15,
              driver_trips_count: 37,
              driver_license_status: 'verified',
              comment: 'Тихая спокойная поездка, без музыки.',
              start_lat: 57.6298,
              start_lng: 39.8737,
              end_lat: 57.6261,
              end_lng: 39.8845,
              driver_username: 'andrey_k',
              driver_created_at: '2024-05-10T10:00:00Z',
              // Контакт водителя (issue #267): в dev отдаём раскрытым, чтобы был виден
              // tel-чип. На бэке раскрывается только пассажиру с активной бронью.
              driver_phone: '+79991234567',
              driver_phone_locked: false,
              // Поездка id=1 в dev-моке — «своя» (issue #339): даёт возможность
              // проверить единый экран водителя (секция «Брони») и блюр-сценку
              // BookingSpotlight из уведомления о новой брони (ref_trip_id: 1
              // в mockNotifications совпадает с ref_user_id: 500 из GET
              // /trips/1/bookings ниже).
              is_own: tripId === 1,
              already_booked: false,
            };
            sendJson({ trip: tripCard });
            return;
          }

          // GET /api/trips (list)
          const window = url.searchParams.get('window');

          const morningTrips = [
            {
              id: 1,
              driver_id: 101,
              time_slot: 'morning',
              trip_date: '2026-06-26',
              departure_time: '07:40:00',
              price_rub: 80,
              seats_total: 3,
              seats_booked: 1,
              seats_available: 2,
              status: 'open',
              start_point_id: 1,
              end_point_id: 2,
              start_title: 'Брагино, ул. Урицкого, 12',
              end_title: 'Центр, пл. Волкова',
              driver_name: 'Андрей К.',
              driver_age: 34,
              driver_rating: 4.9,
              driver_rating_count: 15,
              driver_trips_count: 37,
              driver_license_status: 'verified',
              driver_sex: 'male',
            },
            {
              id: 2,
              driver_id: 102,
              time_slot: 'morning',
              trip_date: '2026-06-26',
              departure_time: '07:55:00',
              price_rub: 70,
              seats_total: 3,
              seats_booked: 0,
              seats_available: 3,
              status: 'open',
              start_point_id: 1,
              end_point_id: 2,
              start_title: 'Брагино, пр-т Дзержинского, 8',
              end_title: 'Центр, пл. Волкова',
              driver_name: 'Марина С.',
              driver_age: 29,
              driver_rating: 5.0,
              driver_rating_count: 8,
              driver_trips_count: 12,
              driver_license_status: 'verified',
              driver_sex: 'female',
            },
          ];

          const eveningTrips = [
            {
              id: 3,
              driver_id: 102,
              time_slot: 'evening',
              trip_date: '2026-06-26',
              departure_time: '17:40:00',
              price_rub: 70,
              seats_total: 3,
              seats_booked: 1,
              seats_available: 2,
              status: 'open',
              start_point_id: 2,
              end_point_id: 1,
              start_title: 'Центр, пл. Волкова',
              end_title: 'Брагино, ул. Урицкого, 12',
              driver_name: 'Марина С.',
              driver_age: 29,
              driver_rating: 5.0,
              driver_rating_count: 8,
              driver_trips_count: 12,
              driver_license_status: 'verified',
              driver_sex: 'female',
            },
            {
              id: 4,
              driver_id: 103,
              time_slot: 'evening',
              trip_date: '2026-06-26',
              departure_time: '18:05:00',
              price_rub: 80,
              seats_total: 3,
              seats_booked: 0,
              seats_available: 3,
              status: 'open',
              start_point_id: 2,
              end_point_id: 1,
              start_title: 'Центр, ул. Свободы, 60',
              end_title: 'Брагино, ул. Урицкого, 12',
              driver_name: 'Олег В.',
              driver_age: 35,
              driver_rating: 4.8,
              driver_rating_count: 20,
              driver_trips_count: 43,
              driver_license_status: 'verified',
              driver_sex: 'male',
            },
          ];

          const trips = forceEmpty ? [] : (window === 'evening' ? eveningTrips : morningTrips);
          sendJson({ trips });
          return;
        }

        // ----- Авторизация (#242) -----
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
        const setSessionCookie = (token: string) => {
          res.setHeader(
            'Set-Cookie',
            `yaride_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
          );
        };

        // POST /api/auth/register
        if (method === 'POST' && pathname === '/auth/register') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const email = String(p.email ?? '').trim();
            const username = String(p.username ?? '').trim();
            if (!EMAIL_RE.test(email)) { sendJson({ error: 'Введите корректный email', field: 'email' }, 400); return; }
            if (String(p.password ?? '').length < 8) { sendJson({ error: 'Пароль должен быть не короче 8 символов', field: 'password' }, 400); return; }
            if (!USERNAME_RE.test(username)) { sendJson({ error: 'Ник: только латиница, цифры и _', field: 'username' }, 400); return; }
            if (!p.pdnConsent) { sendJson({ error: 'Требуется согласие на обработку персональных данных', field: 'pdnConsent' }, 400); return; }
            if (p.sex !== 'male' && p.sex !== 'female') { sendJson({ error: 'Укажите пол', field: 'sex' }, 400); return; }
            if (mockAuthUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
              sendJson({ error: 'Такой email уже зарегистрирован', code: 'email_taken' }, 409); return;
            }
            if (mockAuthUsers.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
              sendJson({ error: 'Этот ник уже занят', code: 'username_taken' }, 409); return;
            }
            const firstName = String(p.firstName ?? '').trim();
            const lastName = String(p.lastName ?? '').trim();
            const user = {
              id: ++mockUserSeq, email, password: String(p.password ?? ''), username,
              firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' ') || username,
              sex: (p.sex === 'male' || p.sex === 'female') ? p.sex : 'unknown',
            };
            mockAuthUsers.push(user);
            const token = `mock-${user.id}-${Date.now()}`;
            mockSessions.set(token, user.id);
            setSessionCookie(token);
            sendJson({ user: mockUserPublic(user) }, 201);
          });
          return;
        }

        // POST /api/auth/login
        if (method === 'POST' && pathname === '/auth/login') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const email = String(p.email ?? '').trim();
            const password = String(p.password ?? '');
            const user = mockAuthUsers.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
            if (!user) { sendJson({ error: 'Неверный email или пароль', code: 'invalid_credentials' }, 401); return; }
            const token = `mock-${user.id}-${Date.now()}`;
            mockSessions.set(token, user.id);
            setSessionCookie(token);
            sendJson({ user: mockUserPublic(user) });
          });
          return;
        }

        // POST /api/auth/logout
        if (method === 'POST' && pathname === '/auth/logout') {
          const token = parseCookieHeader(req.headers.cookie)['yaride_session'];
          if (token) mockSessions.delete(token);
          res.setHeader('Set-Cookie', 'yaride_session=; Path=/; Max-Age=0');
          sendJson({ ok: true });
          return;
        }

        // GET /api/auth/me
        if (method === 'GET' && pathname === '/auth/me') {
          const token = parseCookieHeader(req.headers.cookie)['yaride_session'];
          const userId = token ? mockSessions.get(token) : undefined;
          const user = userId ? mockAuthUsers.find((u) => u.id === userId) : undefined;
          if (!user) { sendJson({ error: 'Не авторизован', code: 'unauthorized' }, 401); return; }
          sendJson({ user: mockUserPublic(user) });
          return;
        }

        // GET /api/route-points (issue #331: анкеры-районы kind='locality' +
        // конкретные остановки kind='stop' с parent_point_id на свой анкер).
        if (method === 'GET' && pathname === '/route-points') {
          const points = [
            { id: 1, locality: 'Ярославль', district: 'Брагино', admin_area: 'Ярославская область', title: 'Брагино, ул. Урицкого, 12', kind: 'locality', latitude: 57.6298, longitude: 39.8737, parent_point_id: null },
            { id: 2, locality: 'Ярославль', district: 'Центральный', admin_area: 'Ярославская область', title: 'Центр, пл. Волкова', kind: 'locality', latitude: 57.6261, longitude: 39.8845, parent_point_id: null },
            // Остановки сбора в Брагино (группа — точка id=1).
            { id: 3, locality: 'Ярославль', district: 'Брагино', admin_area: 'Ярославская область', title: 'ТРК Альтаир', kind: 'stop', latitude: 57.686, longitude: 39.772, parent_point_id: 1 },
            { id: 4, locality: 'Ярославль', district: 'Брагино', admin_area: 'Ярославская область', title: 'ТЦ Космос', kind: 'stop', latitude: 57.665, longitude: 39.809, parent_point_id: 1 },
            { id: 5, locality: 'Ярославль', district: 'Брагино', admin_area: 'Ярославская область', title: 'Проспект Дзержинского', kind: 'stop', latitude: 57.672, longitude: 39.793, parent_point_id: 1 },
            { id: 6, locality: 'Ярославль', district: 'Брагино', admin_area: 'Ярославская область', title: 'ТРЦ РИО', kind: 'stop', latitude: 57.652, longitude: 39.836, parent_point_id: 1 },
            // Остановки финиша в центре (группа — точка id=2).
            { id: 7, locality: 'Ярославль', district: 'Центральный', admin_area: 'Ярославская область', title: 'Шинный завод', kind: 'stop', latitude: 57.601, longitude: 39.860, parent_point_id: 2 },
            { id: 8, locality: 'Ярославль', district: 'Центральный', admin_area: 'Ярославская область', title: 'Площадь Богоявления', kind: 'stop', latitude: 57.629, longitude: 39.896, parent_point_id: 2 },
            { id: 9, locality: 'Ярославль', district: 'Центральный', admin_area: 'Ярославская область', title: 'Волковский театр', kind: 'stop', latitude: 57.627, longitude: 39.898, parent_point_id: 2 },
            { id: 10, locality: 'Ярославль', district: 'Центральный', admin_area: 'Ярославская область', title: 'ТЦ Гигант', kind: 'stop', latitude: 57.615, longitude: 39.855, parent_point_id: 2 },
            { id: 11, locality: 'Ярославль', district: 'Центральный', admin_area: 'Ярославская область', title: 'Ярославль-Главный', kind: 'stop', latitude: 57.611, longitude: 39.835, parent_point_id: 2 },
          ];
          sendJson({ points });
          return;
        }

        // POST /api/bookings
        if (method === 'POST' && pathname === '/bookings') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const params = JSON.parse(body);
            const booking = {
              bookingId: Math.floor(Math.random() * 1000),
              tripId: params.tripId,
              seatsAvailable: 2,
            };
            sendJson({ booking }, 201);
          });
          return;
        }

        // POST /api/alerts
        if (method === 'POST' && pathname === '/alerts') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const params = JSON.parse(body);
            const alertId = mockAlertSeq++;
            mockAlerts.push({
              id: alertId,
              fromPointId: params.fromPointId,
              toPointId: params.toPointId,
              desiredDate: params.date,
              desiredTime: params.time || null,
              status: 'active',
              createdAt: new Date().toISOString(),
            });
            const alert = {
              alertId,
              passengerId: 999,
              fromPointId: params.fromPointId,
              toPointId: params.toPointId,
              desiredDate: params.date,
              desiredTime: params.time || null,
              status: 'active',
            };
            sendJson({ alert }, 201);
          });
          return;
        }

        // POST /api/trips (publish) — принимает опциональные startPointId/endPointId
        // (issue #331, конкретные точки сбора/финиша); без них — прежнее поведение
        // (обратная совместимость со старым body, mock их просто не использует
        // для матчинга — это дев-заглушка без реальной БД точек).
        if (method === 'POST' && pathname === '/trips') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const params = JSON.parse(body);
            const trip = {
              tripId: Math.floor(Math.random() * 1000),
              driverId: 999,
              tripDate: params.date,
              departureTime: params.departureTime,
              timeSlot: params.departureTime < '12:00' ? 'morning' : 'evening',
              seatsTotal: 3,
              priceRub: 80,
              startPointId: params.startPointId ?? null,
              endPointId: params.endPointId ?? null,
            };
            sendJson({ trip }, 201);
          });
          return;
        }

        // POST /api/trips/:id/cancel — отмена всей поездки (mock)
        const cancelTripMatch = pathname.match(/^\/trips\/(\d+)\/cancel$/);
        if (method === 'POST' && cancelTripMatch) {
          const tripId = parseInt(cancelTripMatch[1]);
          sendJson({ result: { tripId, cancelledBookings: 1 } });
          return;
        }

        // GET /api/me/profile
        if (method === 'GET' && pathname === '/me/profile') {
          const profile = {
            name: 'Тестовый Пользователь',
            username: 'mightyxander',
            age: 30,
            rating_avg: 4.9,
            rating_count: 25,
            trips_driver_count: 15,
            trips_passenger_count: 40,
            license_status: 'verified',
            sex: mockSafety.sex,
            tg_linked: mockTgLinked,
          };
          sendJson({ profile });
          return;
        }

        // POST /api/me/telegram-link-token — мок-ссылка привязки TG (#401).
        // Возвращает фиктивный t.me-url; через ~6с помечает профиль привязанным,
        // симулируя, что пользователь дошёл до бота и нажал /start link_...
        if (method === 'POST' && pathname === '/me/telegram-link-token') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            setTimeout(() => { mockTgLinked = true; }, 6000);
            sendJson({ url: 'https://t.me/yaride_dev_bot?start=link_mocktoken' });
          });
          return;
        }

        // GET /api/me/consent — статус согласия с Политикой ПДн/Офертой (#234)
        if (method === 'GET' && pathname === '/me/consent') {
          sendJson({
            pdnConsentVersion: mockConsent.pdnConsentVersion,
            offerConsentVersion: mockConsent.offerConsentVersion,
          });
          return;
        }

        // POST /api/me/consent — зафиксировать согласие (#234)
        if (method === 'POST' && pathname === '/me/consent') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const pdnConsentVersion = String(p.pdnConsentVersion ?? '').trim();
            const offerConsentVersion = String(p.offerConsentVersion ?? '').trim();
            if (!pdnConsentVersion || !offerConsentVersion) {
              sendJson({ error: 'Не указана версия документа' }, 400);
              return;
            }
            mockConsent = { pdnConsentVersion, offerConsentVersion };
            sendJson({ pdnConsentVersion, offerConsentVersion });
          });
          return;
        }

        // GET /api/me/phone — телефон для префилла (#267) + статус SMS-подтверждения (#328)
        if (method === 'GET' && pathname === '/me/phone') {
          sendJson({ phone: mockPhone, verified: mockPhoneVerified, verificationEnabled: true, channel: 'flash_call' });
          return;
        }

        // PUT /api/me/phone — сохранить телефон (#267); смена номера сбрасывает
        // verified (#328), как в реальном updateUserPhone.
        if (method === 'PUT' && pathname === '/me/phone') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const phone = normalizeRuPhoneMock(p.phone ?? '');
            if (phone === null) {
              sendJson({ error: 'Введите корректный российский номер телефона', field: 'phone' }, 400);
              return;
            }
            if (phone === MOCK_TAKEN_PHONE) {
              sendJson({ error: 'phone_taken' }, 409);
              return;
            }
            if (phone !== mockPhone) {
              mockPhoneVerified = false;
            }
            mockPhone = phone;
            sendJson({ phone });
          });
          return;
        }

        // POST /api/me/phone/send-code — сохранить номер + "выслать" код (#328).
        // В dev-моке код всегда '1234', реальный SMSC.ru не вызывается.
        if (method === 'POST' && pathname === '/me/phone/send-code') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const phone = normalizeRuPhoneMock(p.phone ?? '');
            if (phone === null) {
              sendJson({ error: 'Введите корректный российский номер телефона', field: 'phone' }, 400);
              return;
            }
            if (phone === MOCK_TAKEN_PHONE) {
              sendJson({ error: 'phone_taken' }, 409);
              return;
            }
            if (phone !== mockPhone) {
              mockPhoneVerified = false;
            }
            mockPhone = phone;
            sendJson({ sent: true });
          });
          return;
        }

        // POST /api/me/phone/verify-code — подтвердить код (#328). В dev-моке
        // единственный валидный код — '1234'.
        if (method === 'POST' && pathname === '/me/phone/verify-code') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const code = String(p.code ?? '').trim();
            if (code !== MOCK_VERIFICATION_CODE) {
              sendJson({ error: 'Неверный код подтверждения', attemptsLeft: 4 }, 400);
              return;
            }
            mockPhoneVerified = true;
            sendJson({ verified: true });
          });
          return;
        }

        // GET /api/me/safety — настройки безопасности + доверенный контакт (#344)
        if (method === 'GET' && pathname === '/me/safety') {
          sendJson(mockSafety);
          return;
        }

        // PUT /api/me/safety — сохранить целиком (#344); невалидный телефон
        // доверенного контакта → 400 invalid_phone, как в реальном хендлере.
        if (method === 'PUT' && pathname === '/me/safety') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            let trustedContact: { name: string; phone: string } | null = null;
            if (p.trustedContact !== null && p.trustedContact !== undefined) {
              const name = String(p.trustedContact.name ?? '').trim();
              const phone = normalizeRuPhoneMock(p.trustedContact.phone ?? '');
              if (phone === null) {
                sendJson({ error: 'invalid_phone' }, 400);
                return;
              }
              trustedContact = { name, phone };
            }
            mockSafety = {
              sosEnabled: Boolean(p.sosEnabled),
              autoShare: Boolean(p.autoShare),
              womenOnly: Boolean(p.womenOnly),
              trustedContact,
              sex: (p.sex === 'male' || p.sex === 'female' || p.sex === 'unknown') ? p.sex : mockSafety.sex,
            };
            sendJson(mockSafety);
          });
          return;
        }

        // GET /api/me/personal — личные данные + активная заявка (#455).
        if (method === 'GET' && pathname === '/me/personal') {
          sendJson({
            personal: { ...mockPersonal, sex: mockSafety.sex },
            pendingRequest: mockPending,
          });
          return;
        }

        // POST /api/me/personal/request — заявка на изменение (#455). Валидация
        // формата → дельта-фильтр (поля, равные текущим, отбрасываются) → пустая
        // дельта 400 → занятость username/email 409 → создать/заменить pending.
        if (method === 'POST' && pathname === '/me/personal/request') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            let parsed: unknown = {};
            try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
            const p: Record<string, unknown> =
              typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
            const cur = { ...mockPersonal, sex: mockSafety.sex };
            const delta: Record<string, unknown> = {};

            if ('username' in p) {
              if (typeof p.username !== 'string' || p.username.trim() === '') { sendJson({ error: 'Ник не может быть пустым', field: 'username' }, 400); return; }
              const v = p.username.trim();
              if (v.toLowerCase() !== (cur.username ?? '').toLowerCase()) delta.username = v;
            }
            if ('email' in p) {
              if (typeof p.email !== 'string' || !EMAIL_RE.test(p.email.trim())) { sendJson({ error: 'Введите корректный email', field: 'email' }, 400); return; }
              const v = p.email.trim();
              if (v.toLowerCase() !== (cur.email ?? '').toLowerCase()) delta.email = v;
            }
            if ('first_name' in p) {
              if (typeof p.first_name !== 'string' || p.first_name.trim() === '') { sendJson({ error: 'Имя не может быть пустым', field: 'first_name' }, 400); return; }
              const v = p.first_name.trim();
              if (v !== (cur.first_name ?? '')) delta.first_name = v;
            }
            if ('last_name' in p) {
              if (typeof p.last_name !== 'string' || p.last_name.trim() === '') { sendJson({ error: 'Фамилия не может быть пустой', field: 'last_name' }, 400); return; }
              const v = p.last_name.trim();
              if (v !== (cur.last_name ?? '')) delta.last_name = v;
            }
            if ('birth_date' in p) {
              const raw = p.birth_date;
              if (raw === null) {
                if (cur.birth_date !== null) delta.birth_date = null;
              } else if (typeof raw === 'string') {
                const bd = normalizeBirthDateMock(raw.trim());
                if (bd === null) { sendJson({ error: 'Некорректная дата рождения', field: 'birth_date' }, 400); return; }
                if (bd !== cur.birth_date) delta.birth_date = bd;
              } else {
                sendJson({ error: 'Некорректная дата рождения', field: 'birth_date' }, 400); return;
              }
            }
            if ('sex' in p) {
              const s = p.sex;
              if (s !== 'male' && s !== 'female' && s !== 'unknown') { sendJson({ error: 'Некорректный пол', field: 'sex' }, 400); return; }
              if (s !== cur.sex) delta.sex = s;
            }

            if (Object.keys(delta).length === 0) { sendJson({ error: 'Нет изменений', code: 'empty_delta' }, 400); return; }

            if (typeof delta.username === 'string') {
              const un = delta.username.toLowerCase();
              if (un === MOCK_TAKEN_USERNAME || mockAuthUsers.some((u) => u.username.toLowerCase() === un)) {
                sendJson({ error: 'Этот ник уже занят', code: 'username_taken', field: 'username' }, 409); return;
              }
            }
            if (typeof delta.email === 'string') {
              const em = delta.email.toLowerCase();
              if (em === MOCK_TAKEN_EMAIL || mockAuthUsers.some((u) => u.email.toLowerCase() === em)) {
                sendJson({ error: 'Такой email уже зарегистрирован', code: 'email_taken', field: 'email' }, 409); return;
              }
            }

            mockPending = { id: mockPendingSeq++, payload: delta, status: 'pending', created_at: new Date().toISOString() };
            sendJson({ request: mockPending });
          });
          return;
        }

        // GET /api/me/credentials — статус входа по email (#273)
        if (method === 'GET' && pathname === '/me/credentials') {
          sendJson({
            hasPassword: mockCredentials.hasPassword,
            email: mockCredentials.email,
            username: mockCredentials.username,
          });
          return;
        }

        // POST /api/me/credentials — добавить email+username+пароль (#273)
        if (method === 'POST' && pathname === '/me/credentials') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const email = String(p.email ?? '').trim();
            const username = String(p.username ?? '').trim();
            const password = String(p.password ?? '');
            if (mockCredentials.hasPassword) {
              sendJson({ error: 'Для аккаунта уже настроен вход по email', code: 'already_set' }, 409); return;
            }
            if (!EMAIL_RE.test(email)) { sendJson({ error: 'Введите корректный email', field: 'email' }, 400); return; }
            if (password.length < 8) { sendJson({ error: 'Пароль должен быть не короче 8 символов', field: 'password' }, 400); return; }
            if (!USERNAME_RE.test(username)) { sendJson({ error: 'Ник: только латиница, цифры и _', field: 'username' }, 400); return; }
            // Конфликты с веб-аккаунтами мок-регистрации (email — все; username — веб).
            if (mockAuthUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
              sendJson({ error: 'Такой email уже зарегистрирован', code: 'email_taken' }, 409); return;
            }
            if (mockAuthUsers.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
              sendJson({ error: 'Этот ник уже занят', code: 'username_taken' }, 409); return;
            }
            mockCredentials.hasPassword = true;
            mockCredentials.email = email;
            mockCredentials.username = username;
            sendJson({
              user: { id: 999, name: 'Тестовый Пользователь', email, username, first_name: 'Тестовый', last_name: 'Пользователь' },
            });
          });
          return;
        }

        // POST /api/me/link-account — привязать браузерную учётку к TG-карточке (#300)
        if (method === 'POST' && pathname === '/me/link-account') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const p = JSON.parse(body || '{}');
            const email = String(p.email ?? '').trim();
            const password = String(p.password ?? '');
            if (!EMAIL_RE.test(email) || password.length === 0) {
              sendJson({ error: 'Укажите email и пароль', field: 'email' }, 400); return;
            }
            const idx = mockAuthUsers.findIndex(
              (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
            );
            if (idx === -1) {
              sendJson({ error: 'Неверный email или пароль', code: 'invalid_credentials' }, 401); return;
            }
            const web = mockAuthUsers[idx];
            // «Слияние»: веб-учётка переезжает в текущую карточку, из списка убираем.
            mockAuthUsers.splice(idx, 1);
            mockCredentials.hasPassword = true;
            mockCredentials.email = web.email;
            mockCredentials.username = web.username;
            sendJson({ linked: true, email: web.email, username: web.username });
          });
          return;
        }

        // GET /api/me/trips
        if (method === 'GET' && pathname === '/me/trips') {
          const status = url.searchParams.get('status');

          const upcomingTrips = [
            // «Моя поездка» (issue #339): та же поездка id=1, что и в GET /trips/:id
            // (is_own) и в уведомлении «Новая бронь» (mockNotifications) — открывает
            // единый экран с секцией «Брони» из GET /trips/1/bookings.
            {
              trip_id: 1,
              role: 'driver',
              trip_date: '2026-06-26',
              departure_time: '07:40:00',
              time_slot: 'morning',
              start_title: 'Брагино, ул. Урицкого, 12',
              end_title: 'Центр, пл. Волкова',
              price_rub: 80,
              seats_total: 3,
              seats_booked: 1,
              trip_status: 'open',
              booking_id: null,
              booking_status: null,
              passenger_seats: null,
              driver_id: null,
              rated_by_me: false,
            },
            {
              trip_id: 5,
              role: 'passenger',
              trip_date: '2026-06-27',
              departure_time: '07:40:00',
              time_slot: 'morning',
              start_title: 'Брагино, ул. Урицкого, 12',
              end_title: 'Центр, пл. Волкова',
              price_rub: 80,
              seats_total: 3,
              seats_booked: 1,
              trip_status: 'open',
              booking_id: 101,
              booking_status: 'active',
              passenger_seats: 1,
              driver_id: 101,
              rated_by_me: mockRatedPairs.has('5:101'),
            },
          ];

          const pastTrips = [
            {
              trip_id: 6,
              role: 'passenger',
              trip_date: '2026-06-25',
              departure_time: '07:40:00',
              time_slot: 'morning',
              start_title: 'Брагино, ул. Урицкого, 12',
              end_title: 'Центр, пл. Волкова',
              price_rub: 80,
              seats_total: 3,
              seats_booked: 2,
              trip_status: 'completed',
              booking_id: 100,
              booking_status: 'active',
              passenger_seats: 1,
              driver_id: 101,
              rated_by_me: mockRatedPairs.has('6:101'),
            },
          ];

          const trips = forceEmpty ? [] : (status === 'past' ? pastTrips : upcomingTrips);
          sendJson({ trips });
          return;
        }

        // GET /api/me/template
        if (method === 'GET' && pathname === '/me/template') {
          const template = {
            id: 1,
            start_point_id: 1,
            end_point_id: 2,
            time_slot: 'morning',
            price_rub: 80,
            seats_total: 3,
          };
          sendJson(template);
          return;
        }

        // GET /api/me/alerts — активные заявки текущего юзера (issue #321;
        // mock_empty=true → пустой список, тот же контур, что /me/cars/trips)
        if (method === 'GET' && pathname === '/me/alerts') {
          const today = new Date().toISOString().slice(0, 10);
          const alerts = forceEmpty
            ? []
            : mockAlerts
                .filter((a) => a.status === 'active' && a.desiredDate >= today)
                .sort((a, b) => (a.desiredDate + (a.desiredTime ?? '')).localeCompare(b.desiredDate + (b.desiredTime ?? '')))
                .map((a) => ({
                  id: a.id,
                  fromPointId: a.fromPointId,
                  toPointId: a.toPointId,
                  fromTitle: mockAlertPoints[a.fromPointId] ?? 'Точка маршрута',
                  toTitle: mockAlertPoints[a.toPointId] ?? 'Точка маршрута',
                  desiredDate: a.desiredDate,
                  desiredTime: a.desiredTime,
                  status: a.status,
                  createdAt: a.createdAt,
                }));
          sendJson({ alerts });
          return;
        }

        // GET /api/me/cars — машины водителя (mock_empty=true → пустой список)
        if (method === 'GET' && pathname === '/me/cars') {
          sendJson({ cars: forceEmpty ? [] : mockCars });
          return;
        }

        // POST /api/me/cars — добавить машину (пишем в in-memory список)
        if (method === 'POST' && pathname === '/me/cars') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const params = JSON.parse(body);
            const car = {
              id: mockCars.reduce((max, c) => Math.max(max, c.id), 0) + 1,
              model: params.model,
              color: params.color ?? null,
              plate: params.plate ?? null,
            };
            mockCars.push(car);
            sendJson({ car }, 201);
          });
          return;
        }

        // GET /api/notifications — лента уведомлений (mock_empty=true → пусто)
        if (method === 'GET' && pathname === '/notifications') {
          // Ленивый авто-архив (issue #337): прочитанные 2+ дня назад (по readAt) —
          // как UPDATE ... SET archived=TRUE в handleGetNotifications на реальном бэке.
          for (const n of mockNotifications) {
            if (n.read && n.readAt !== null && !n.archived && Date.now() - n.readAt > TWO_DAYS_MS) {
              n.archived = true;
            }
          }
          const items = forceEmpty
            ? []
            : mockNotifications
                .filter((n) => !n.archived)
                .map((n) => ({
                  id: n.id,
                  type: n.type,
                  title: n.title,
                  body: n.body,
                  read: n.read,
                  ref_trip_id: n.ref_trip_id,
                  ref_user_id: n.ref_user_id,
                  created_at: new Date(Date.now() - n.minutesAgo * 60000).toISOString(),
                }));
          sendJson({ notifications: items });
          return;
        }

        // POST /api/notifications/read — пометить прочитанным (in-memory)
        if (method === 'POST' && pathname === '/notifications/read') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const params = JSON.parse(body);
            const item = mockNotifications.find((n) => n.id === params.notificationId);
            if (item) {
              item.read = true;
              if (item.readAt === null) item.readAt = Date.now();
            }
            sendJson({ success: true });
          });
          return;
        }

        // DELETE /api/notifications/:id — свайп-удаление (issue #337)
        if (method === 'DELETE' && pathname.match(/^\/notifications\/\d+$/)) {
          const idMatch = pathname.match(/^\/notifications\/(\d+)$/);
          const id = idMatch ? parseInt(idMatch[1]) : 0;
          const idx = mockNotifications.findIndex((n) => n.id === id);
          if (idx >= 0) mockNotifications.splice(idx, 1);
          sendJson({ success: true });
          return;
        }

        // POST /api/notifications/clear — очистить всю ленту (issue #337)
        if (method === 'POST' && pathname === '/notifications/clear') {
          const deletedCount = mockNotifications.length;
          mockNotifications.length = 0;
          sendJson({ success: true, deletedCount });
          return;
        }

        // GET /api/users/:id/profile — публичный профиль (известные водители + fallback)
        const userProfileMatch = pathname.match(/^\/users\/(\d+)\/profile$/);
        if (method === 'GET' && userProfileMatch) {
          const id = parseInt(userProfileMatch[1]);
          const known = mockUserProfiles[id];
          const profile = known
            ? { id, ...known }
            : { id, name: 'Пользователь', age: null, trips_count: 0, rating: 0, rating_count: 0, joined_at: new Date().toISOString(), is_driver: false, license_verified: false };
          sendJson({ profile });
          return;
        }

        // GET /api/users/:id/reviews — отзывы (mock_empty=true → пусто)
        if (method === 'GET' && pathname.match(/^\/users\/\d+\/reviews$/)) {
          sendJson({ reviews: forceEmpty ? [] : mockReviews });
          return;
        }

        // POST /api/me/license — отправка ВУ на модерацию
        if (method === 'POST' && pathname === '/me/license') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            sendJson({ request: { requestId: Math.floor(Math.random() * 1000), status: 'pending' } }, 201);
          });
          return;
        }

        // POST /api/ratings — повторный сабмит той же пары (tripId, rateeId) → 409
        // already_rated (issue #354), как чистая ошибка бэка вместо сырого 23505.
        if (method === 'POST' && pathname === '/ratings') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const params = JSON.parse(body);
            const key = `${params.tripId}:${params.rateeId}`;
            if (mockRatedPairs.has(key)) {
              sendJson({ error: 'Вы уже оценили эту поездку', code: 'already_rated' }, 409);
              return;
            }
            mockRatedPairs.add(key);
            const rating = {
              ratingId: Math.floor(Math.random() * 1000),
              tripId: params.tripId,
              rateeId: params.rateeId,
              stars: params.stars,
              rateeNewAvg: 4.9,
              rateeNewCount: 26,
            };
            sendJson({ rating }, 201);
          });
          return;
        }

        // GET /api/trips/:id/bookings
        if (method === 'GET' && pathname.match(/^\/trips\/\d+\/bookings$/)) {
          const bookings = forceEmpty ? [] : [
            {
              booking_id: 201,
              passenger_id: 500,
              passenger_name: 'Анна С.',
              passenger_username: 'anna_s',
              seats: 1,
              status: 'active',
              created_at: '2026-06-26T06:00:00Z',
              // Телефон пассажира (issue #267): на бэке отдаётся водителю только
              // для активной брони. В dev — показываем tel-чип в карточке брони.
              passenger_phone: '+79995554433',
            },
          ];
          sendJson({ bookings });
          return;
        }

        // GET /api/trips/:id/participants — участники поездки (водитель + активные пассажиры)
        if (method === 'GET' && pathname.match(/^\/trips\/\d+\/participants$/)) {
          const participantsTripIdMatch = pathname.match(/^\/trips\/(\d+)\/participants$/);
          const participantsTripId = participantsTripIdMatch ? participantsTripIdMatch[1] : '';
          const participants = [
            { user_id: 1, name: 'Андрей К.', role: 'driver', rating: 4.9, rating_count: 25, license_verified: true, rated_by_me: mockRatedPairs.has(`${participantsTripId}:1`) },
            ...(forceEmpty ? [] : [
              { user_id: 500, name: 'Анна С.', role: 'passenger', rating: 4.8, rating_count: 12, license_verified: false, rated_by_me: mockRatedPairs.has(`${participantsTripId}:500`) },
              { user_id: 501, name: 'Игорь П.', role: 'passenger', rating: 5.0, rating_count: 3, license_verified: false, rated_by_me: mockRatedPairs.has(`${participantsTripId}:501`) },
            ]),
          ];
          sendJson({ participants });
          return;
        }

        // PATCH /api/bookings/:id — cancel_by_driver | confirm_by_driver (issue #339)
        if (method === 'PATCH' && pathname.match(/^\/bookings\/\d+$/)) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const bookingIdMatch = pathname.match(/^\/bookings\/(\d+)$/);
            const bookingId = bookingIdMatch ? parseInt(bookingIdMatch[1]) : 0;
            const params = body ? JSON.parse(body) : {};
            if (params.action === 'confirm_by_driver') {
              const result = { bookingId, tripId: 1 };
              sendJson({ result });
              return;
            }
            const result = {
              bookingId,
              tripId: 1,
              seatsFreed: 1,
              newAvailable: 3,
            };
            sendJson({ result });
          });
          return;
        }

        // DELETE /api/alerts/:id (issue #319) — снимаем из mockAlerts, чтобы
        // GET /api/me/alerts (issue #321) сразу переставал её показывать.
        if (method === 'DELETE' && pathname.match(/^\/alerts\/\d+$/)) {
          const alertIdMatch = pathname.match(/^\/alerts\/(\d+)$/);
          const alertId = alertIdMatch ? parseInt(alertIdMatch[1]) : 0;
          const found = mockAlerts.find((a) => a.id === alertId);
          if (found) found.status = 'cancelled';
          const alert = {
            alertId,
            status: 'cancelled',
          };
          sendJson({ alert });
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockApiPlugin(), privacyPagePlugin(), offerPagePlugin()],
})
