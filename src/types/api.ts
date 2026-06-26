/**
 * Типы запросов/ответов для фронтенд-API-клиента.
 * Согласовано с src/server/repo.ts и src/server/api.ts (issue #42).
 */

export type TimeSlot = 'morning' | 'evening';
export type TripStatus = 'open' | 'cancelled' | 'completed';
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
  status: string;
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

export interface GetTripsRequest {
  corridor?: string;
  window?: TimeSlot;
  date?: string;
}

export interface GetTripsResponse {
  trips: TripListItem[];
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

export interface GetTripResponse {
  trip: TripCard;
}

// POST /api/bookings
export interface CreateBookingRequest {
  tripId: number;
  seats?: number;
}

export interface BookingResult {
  bookingId: number;
  tripId: number;
  seatsAvailable: number;
}

export interface CreateBookingResponse {
  booking: BookingResult;
}

// POST /api/alerts
export interface CreateAlertRequest {
  fromPointId: number;
  toPointId: number;
  date: string;
  time?: string | null;
}

export interface RouteAlertResult {
  alertId: number;
  passengerId: number;
  fromPointId: number;
  toPointId: number;
  desiredDate: string;
  desiredTime: string | null;
  status: string;
}

export interface CreateAlertResponse {
  alert: RouteAlertResult;
}

// POST /api/trips
export interface PublishTripRequest {
  templateId: number;
  date: string;
  departureTime: string;
}

export interface PublishTripResult {
  tripId: number;
  driverId: number;
  tripDate: string;
  departureTime: string;
  timeSlot: TimeSlot;
  seatsTotal: number;
  priceRub: number;
}

export interface PublishTripResponse {
  trip: PublishTripResult;
}

// GET /api/me/profile
export interface UserProfile {
  name: string;
  age: number | null;
  rating_avg: number;
  rating_count: number;
  trips_driver_count: number;
  trips_passenger_count: number;
  license_status: string;
}

export interface GetMyProfileResponse {
  profile: UserProfile;
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

export interface GetMyTripsRequest {
  status?: TripStatusFilter;
}

export interface GetMyTripsResponse {
  trips: UserTripItem[];
}

// POST /api/ratings
export interface CreateRatingRequest {
  tripId: number;
  rateeId: number;
  stars: number;
  tags?: string | null;
  comment?: string | null;
}

export interface CreateRatingResult {
  ratingId: number;
  tripId: number;
  rateeId: number;
  stars: number;
  rateeNewAvg: number;
  rateeNewCount: number;
}

export interface CreateRatingResponse {
  rating: CreateRatingResult;
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

export interface GetTripBookingsResponse {
  bookings: BookingDetail[];
}

// PATCH /api/bookings/:id
export interface CancelBookingRequest {
  action: 'cancel_by_driver';
}

export interface CancelBookingResult {
  bookingId: number;
  tripId: number;
  seatsFreed: number;
  newAvailable: number;
}

export interface CancelBookingResponse {
  result: CancelBookingResult;
}

// Ошибки
export interface ApiErrorResponse {
  error: string;
  [key: string]: unknown;
}
