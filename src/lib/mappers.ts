/**
 * Маппинг типов API → фронтенд (домен Поездки).
 * TripListItem (бэкенд) → Trip (навигация/UI).
 */

import type { TripListItem, TripCard } from '../types/api';
import type { Trip } from '../types/navigation';

/**
 * Преобразует TripListItem из API в Trip для UI.
 * Используется для списков поездок (main/evening-main).
 */
export function mapTripListItemToTrip(item: TripListItem): Trip {
  const initials = item.driver_name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const memberSinceDate = new Date();
  const monthNames = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const memberSince = `${monthNames[memberSinceDate.getMonth()]} ${memberSinceDate.getFullYear()}`;

  const verified = item.driver_license_status === 'verified';

  return {
    id: String(item.id),
    driver: {
      id: item.driver_id,
      name: item.driver_name,
      rating: item.driver_rating,
      tripCount: item.driver_trips_count,
      avatar: initials,
      age: item.driver_age ?? undefined,
      verified,
      memberSince,
    },
    address: item.start_title,
    car: item.car_model, // модель машины (null, если не указана) — без плейсхолдера
    price: String(item.price_rub),
    time: item.departure_time.slice(0, 5), // "HH:MM:SS" → "HH:MM"
    tripDate: item.trip_date,
    status: item.status,
    seats: item.seats_available,
    route: {
      from: item.start_title,
      to: item.end_title,
      duration: undefined, // API не возвращает duration в списке
    },
    isOwn: item.is_own,
    carColor: item.car_color,
    plate: item.plate,
  };
}

/**
 * Преобразует TripCard (детальная карточка) в Trip для UI.
 * Используется при дозагрузке деталей поездки.
 */
export function mapTripCardToTrip(card: TripCard): Trip {
  const base = mapTripListItemToTrip(card);

  // При наличии дополнительных полей в TripCard — можно добавить их в Trip
  // Например, комментарий водителя, координаты точек и т.д.

  return base;
}
