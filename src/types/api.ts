/**
 * API-типы для фронтенд-клиента (фаза рыба→БД).
 * Согласованы с src/server/repo.ts и src/server/api.ts из issue #42.
 */

export type TimeSlot = 'morning' | 'evening';
export type TripStatus = 'open' | 'active' | 'completed' | 'cancelled';
export type BookingStatus = 'active' | 'cancelled_by_passenger' | 'cancelled_by_driver';
export type TripStatusFilter = 'upcoming' | 'past';

// GET /api/trips
export interface TripListItem {
  id: number;
  driver_id: number;
  time_slot: TimeSlot;
  trip_date: string;
  departure_time: string;
  price_rub: number;
  seats_total: number;
  seats_booked: number;
  seats_available: number;
  status: TripStatus;
  start_point_id: number;
  end_point_id: number;
  start_title: string;
  end_title: string;
  driver_name: string;
  driver_age: number | null;
  driver_rating: number;
  driver_rating_count: number;
  driver_trips_count: number;
  driver_license_status: string;
}

// GET /api/trips/:id
export interface TripCard extends TripListItem {
  comment: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  driver_username: string | null;
  driver_created_at: string;
}

// POST /api/bookings
export interface CreateBookingRequest {
  tripId: number;
  seats?: number;
  initData: string;
}

export interface CreateBookingResponse {
  booking: {
    bookingId: number;
    tripId: number;
    seatsAvailable: number;
  };
}

// POST /api/alerts
export interface CreateAlertRequest {
  fromPointId: number;
  toPointId: number;
  date: string;
  time?: string;
  initData: string;
}

export interface CreateAlertResponse {
  alert: {
    alertId: number;
    passengerId: number;
    fromPointId: number;
    toPointId: number;
    desiredDate: string;
    desiredTime: string | null;
    status: string;
  };
}

// POST /api/trips
export interface PublishTripRequest {
  templateId: number;
  date: string;
  departureTime: string;
  initData: string;
}

export interface PublishTripResponse {
  trip: {
    tripId: number;
    driverId: number;
    tripDate: string;
    departureTime: string;
    timeSlot: TimeSlot;
    seatsTotal: number;
    priceRub: number;
  };
}

// GET /api/me/profile
export interface UserProfile {
  id: number;
  tg_user_id: number;
  name: string;
  username: string | null;
  age: number | null;
  rating_avg: number;
  rating_count: number;
  trips_driver_count: number;
  trips_passenger_count: number;
  license_status: string;
}

// GET /api/me/trips
export interface UserTripItem {
  trip_id: number;
  role: 'driver' | 'passenger';
  trip_date: string;
  departure_time: string;
  time_slot: TimeSlot;
  start_title: string;
  end_title: string;
  price_rub: number;
  seats_total: number;
  seats_booked: number;
  trip_status: string;
  booking_id: number | null;
  booking_status: string | null;
  passenger_seats: number | null;
}

// POST /api/ratings
export interface CreateRatingRequest {
  tripId: number;
  rateeId: number;
  stars: number;
  tags?: string;
  comment?: string;
  initData: string;
}

export interface CreateRatingResponse {
  rating: {
    ratingId: number;
    tripId: number;
    raterId: number;
    rateeId: number;
    stars: number;
    tags: string | null;
    comment: string | null;
  };
}

// PATCH /api/bookings/:id
export interface CancelBookingRequest {
  action: 'cancel_by_driver';
  initData: string;
}

export interface CancelBookingResponse {
  result: {
    bookingId: number;
    tripId: number;
    previousStatus: string;
    newStatus: string;
    seatsReleased: number;
  };
}

// GET /api/trips/:id/bookings
export interface BookingDetail {
  booking_id: number;
  passenger_id: number;
  passenger_name: string;
  passenger_username: string | null;
  seats: number;
  status: string;
  created_at: string;
}

// Общий тип ошибки API
export interface ApiError {
  error: string;
  [key: string]: unknown;
}
