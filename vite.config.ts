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

        // Mock GET /api/trips
        if (req.url?.startsWith('/trips')) {
          const url = new URL(req.url, 'http://localhost');
          const window = url.searchParams.get('window');

          // Для QA скелетонов: добавь задержку
          const delay = url.searchParams.get('delay');
          if (delay) {
            setTimeout(() => {
              sendTripsResponse();
            }, parseInt(delay));
            return;
          }

          const sendTripsResponse = () => {

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

            // Для QA empty state: раскомментируй следующую строку
            // const trips: any[] = [];
            const trips = window === 'evening' ? eveningTrips : morningTrips;

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ trips }));
          };

          sendTripsResponse();
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
