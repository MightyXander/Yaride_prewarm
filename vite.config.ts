import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ViteDevServer } from 'vite'

// Mock API middleware для QA (когда backend недоступен)
function mockApiPlugin() {
  return {
    name: 'mock-api',
    configureServer(server: ViteDevServer) {
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
            },
          ];
          sendJson({ bookings });
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
  plugins: [react(), mockApiPlugin()],
})
