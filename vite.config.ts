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

      // In-memory лента уведомлений (read-флаг переживает POST /notifications/read).
      // created_at вычисляется на лету из minutesAgo, чтобы относительное время не «протухало».
      const mockNotifications: {
        id: number; type: 'booking' | 'booking_confirmed' | 'cancel' | 'rate_reminder' | 'trip_new';
        title: string; body: string; read: boolean;
        ref_trip_id: number | null; ref_user_id: number | null; minutesAgo: number;
      }[] = [
        { id: 1, type: 'booking_confirmed', title: 'Бронь подтверждена', body: 'Андрей К. подтвердил вашу бронь на 07:40, Брагино → Центр.', read: false, ref_trip_id: 1, ref_user_id: 101, minutesAgo: 8 },
        { id: 2, type: 'booking', title: 'Новая бронь', body: 'Анна С. забронировала место в вашей поездке 07:40.', read: false, ref_trip_id: 1, ref_user_id: 500, minutesAgo: 95 },
        { id: 3, type: 'rate_reminder', title: 'Оцените поездку', body: 'Как прошла поездка с Мариной С.? Оставьте оценку.', read: true, ref_trip_id: 6, ref_user_id: 102, minutesAgo: 1500 },
        { id: 4, type: 'cancel', title: 'Поездка отменена', body: 'Олег В. отменил поездку на 18:05. Бронь снята.', read: true, ref_trip_id: 4, ref_user_id: 103, minutesAgo: 4400 },
        { id: 5, type: 'trip_new', title: 'Поездка по вашему маршруту', body: 'По вашему маршруту Брагино → Центр появилась поездка на завтра в 08:10.', read: false, ref_trip_id: 2, ref_user_id: 102, minutesAgo: 20 },
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
        firstName: string; lastName: string; name: string;
      }[] = [];
      const mockSessions = new Map<string, number>(); // token → userId
      let mockUserSeq = 1000;

      // In-memory телефон текущего пользователя (#267). Префилл и сохранение
      // переживают между запросами в dev/QA без backend. Нормализация повторяет
      // серверную: 8/+7/7 + 10 цифр (оператор «9») → +7XXXXXXXXXX, иначе null.
      let mockPhone: string | null = null;
      // In-memory статус входа по email текущего (TG) пользователя (#273).
      // Имитирует users-строку с tg_user_id и без пароля: username — снимок TG-ника.
      const mockCredentials: { hasPassword: boolean; email: string | null; username: string | null } = {
        hasPassword: false,
        email: null,
        username: 'tg_snapshot',
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
        first_name: u.firstName, last_name: u.lastName,
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

        // GET /api/route-points
        if (method === 'GET' && pathname === '/route-points') {
          const points = [
            { id: 1, locality: 'Ярославль', district: 'Брагино', admin_area: 'Ярославская область', title: 'Брагино, ул. Урицкого, 12', kind: 'house', latitude: 57.6298, longitude: 39.8737 },
            { id: 2, locality: 'Ярославль', district: 'Центральный', admin_area: 'Ярославская область', title: 'Центр, пл. Волкова', kind: 'locality', latitude: 57.6261, longitude: 39.8845 },
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
            const alert = {
              alertId: Math.floor(Math.random() * 1000),
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

        // POST /api/trips (publish)
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
            age: 30,
            rating_avg: 4.9,
            rating_count: 25,
            trips_driver_count: 15,
            trips_passenger_count: 40,
            license_status: 'verified',
          };
          sendJson({ profile });
          return;
        }

        // GET /api/me/phone — телефон для префилла (#267)
        if (method === 'GET' && pathname === '/me/phone') {
          sendJson({ phone: mockPhone });
          return;
        }

        // PUT /api/me/phone — сохранить телефон (#267)
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
            mockPhone = phone;
            sendJson({ phone });
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
          const items = forceEmpty
            ? []
            : mockNotifications.map((n) => ({
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
            if (item) item.read = true;
            sendJson({ success: true });
          });
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

        // POST /api/ratings
        if (method === 'POST' && pathname === '/ratings') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const params = JSON.parse(body);
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
          const participants = [
            { user_id: 1, name: 'Андрей К.', role: 'driver', rating: 4.9, rating_count: 25, license_verified: true },
            ...(forceEmpty ? [] : [
              { user_id: 500, name: 'Анна С.', role: 'passenger', rating: 4.8, rating_count: 12, license_verified: false },
              { user_id: 501, name: 'Игорь П.', role: 'passenger', rating: 5.0, rating_count: 3, license_verified: false },
            ]),
          ];
          sendJson({ participants });
          return;
        }

        // PATCH /api/bookings/:id
        if (method === 'PATCH' && pathname.match(/^\/bookings\/\d+$/)) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const bookingIdMatch = pathname.match(/^\/bookings\/(\d+)$/);
            const bookingId = bookingIdMatch ? parseInt(bookingIdMatch[1]) : 0;
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

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockApiPlugin(), privacyPagePlugin()],
})
