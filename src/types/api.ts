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
  is_own: boolean;
  already_booked: boolean;
  car_model: string | null;
  car_color: string | null;
  plate: string | null;
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
  /** true — у поездки есть госномер, но он скрыт (нет брони). UI показывает цензуру. */
  plate_locked?: boolean;
  /** Телефон водителя — приходит пассажиру с активной бронью (тот же контур, что и plate), иначе null. */
  driver_phone?: string | null;
  /** true — у водителя есть телефон, но он скрыт (нет активной брони). UI показывает locked-подпись. */
  driver_phone_locked?: boolean;
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

// DELETE /api/alerts/:id (issue #319)
export interface CancelAlertResult {
  alertId: number;
  status: string;
}

export interface CancelAlertResponse {
  alert: CancelAlertResult;
}

// GET /api/me/alerts (issue #321)
export interface MyAlertItem {
  id: number;
  fromPointId: number;
  toPointId: number;
  fromTitle: string;
  toTitle: string;
  desiredDate: string;
  desiredTime: string | null;
  status: string;
  createdAt: string;
}

export interface GetMyAlertsResponse {
  alerts: MyAlertItem[];
}

// POST /api/trips
export interface PublishTripRequest {
  templateId: number;
  date: string;
  departureTime: string;
  reverse?: boolean;
  /** Выбранная машина водителя (опц.) — её модель/цвет/номер попадут в поездку. */
  carId?: number;
  /**
   * Опциональные конкретные точки сбора/финиша (issue #331): заданы вместе —
   * сервер приоритезирует их над reverse (валидирует существование/kind='stop'/
   * разные группы). Не заданы — прежнее поведение (точки шаблона + reverse).
   */
  startPointId?: number;
  endPointId?: number;
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
  id: number;
  name: string;
  /** Ник пользователя на площадке (@username). null — не задан (TG без ника, конфликт ника). */
  username?: string | null;
  age: number | null;
  rating_avg: number;
  rating_count: number;
  trips_driver_count: number;
  trips_passenger_count: number;
  license_status: string;
  /** Серия/номер ВУ из последней заявки (для статусного экрана). null — заявок нет. */
  license_series?: string | null;
  /** Срок действия ВУ из последней заявки. null — заявок нет. */
  license_valid_until?: string | null;
}

export interface GetMyProfileResponse {
  profile: UserProfile;
}

// GET /api/me/consent — статус согласия с Политикой ПДн/Офертой (issue #234).
// null-версия означает «согласие ещё не зафиксировано» — фронт сравнивает
// с POLICY_VERSION/OFFER_VERSION (src/lib/policy.ts).
export interface GetMyConsentResponse {
  pdnConsentVersion: string | null;
  offerConsentVersion: string | null;
}

// POST /api/me/consent — зафиксировать согласие текущего пользователя.
export interface SetMyConsentRequest {
  pdnConsentVersion: string;
  offerConsentVersion: string;
}

export interface SetMyConsentResponse {
  pdnConsentVersion: string;
  offerConsentVersion: string;
}

// GET /api/me/phone — телефон текущего пользователя (null, если ещё не задан).
// verified/verificationEnabled — issue #328 (SMS-подтверждение номера).
// verificationEnabled=false, пока на бэке не заданы креды SMSC_LOGIN/SMSC_PASSWORD —
// в этом случае UI подтверждения скрыт полностью (см. PhoneField.tsx).
export interface GetMyPhoneResponse {
  phone: string | null;
  verified: boolean;
  verificationEnabled: boolean;
  // Канал доставки кода (issue #328): 'flash_call' — код = последние 4 цифры
  // звонящего робота, 'sms' — код в тексте сообщения. Определяет формулировку
  // подсказки в PhoneField (иначе текст про «звонок» вводит в заблуждение при SMS).
  channel: 'flash_call' | 'sms';
}

// PUT /api/me/phone — сохранить телефон (сбор «по требованию», issue #267).
export interface SaveMyPhoneRequest {
  phone: string;
}

export interface SaveMyPhoneResponse {
  /** Нормализованный сервером номер в форме +7XXXXXXXXXX. */
  phone: string;
}

// POST /api/me/phone/send-code — выслать код подтверждения номера (issue #328).
export interface SendPhoneCodeRequest {
  phone: string;
}

export interface SendPhoneCodeResponse {
  sent: true;
}

// POST /api/me/phone/verify-code — подтвердить номер кодом (issue #328).
export interface VerifyPhoneCodeRequest {
  code: string;
}

export interface VerifyPhoneCodeResponse {
  verified: true;
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
  driver_id: number | null;
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
  /** Телефон пассажира — приходит водителю поездки только для активной брони, иначе null. */
  passenger_phone?: string | null;
}

export interface GetTripBookingsResponse {
  bookings: BookingDetail[];
}

// GET /api/trips/:id/participants
export interface TripParticipant {
  user_id: number;
  name: string;
  role: 'driver' | 'passenger';
  rating: number;
  rating_count: number;
  license_verified: boolean;
}

export interface GetTripParticipantsResponse {
  participants: TripParticipant[];
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

// PATCH /api/bookings/:id { action: 'confirm_by_driver' } (issue #339)
export interface ConfirmBookingRequest {
  action: 'confirm_by_driver';
}

export interface ConfirmBookingResult {
  bookingId: number;
  tripId: number;
}

export interface ConfirmBookingResponse {
  result: ConfirmBookingResult;
}

// GET /api/route-points
export interface RoutePoint {
  id: number;
  locality: string;
  district: string;
  admin_area: string;
  title: string;
  kind: string;
  latitude: number | null;
  longitude: number | null;
  /** Группа точки (issue #331): NULL у анкеров-районов, id анкера у конкретной остановки. */
  parent_point_id: number | null;
}

export interface GetRoutePointsResponse {
  points: RoutePoint[];
}

// GET /api/me/template
export interface DriverTemplate {
  id: number;
  start_point_id: number;
  end_point_id: number;
  time_slot: TimeSlot;
  price_rub: number;
  seats_total: number;
}

export interface GetMyTemplateResponse {
  id: number;
  start_point_id: number;
  end_point_id: number;
  time_slot: TimeSlot;
  price_rub: number;
  seats_total: number;
}

// POST /api/me/license
export interface SubmitLicenseRequest {
  seriesNumber: string;
  validUntil: string;
}

export interface SubmitLicenseResult {
  requestId: number;
  status: string;
}

export interface SubmitLicenseResponse {
  request: SubmitLicenseResult;
}

// GET /api/users/:id/profile
export interface PublicUserProfile {
  id: number;
  name: string;
  age: number | null;
  trips_count: number;
  rating: number;
  rating_count: number;
  joined_at: string;
  is_driver: boolean;
  license_verified: boolean;
}

export interface GetUserProfileResponse {
  profile: PublicUserProfile;
}

// GET /api/users/:id/reviews
export interface UserReview {
  author_id: number;
  author_name: string;
  stars: number;
  comment: string | null;
  tags: string | null;
  created_at: string;
}

export interface GetUserReviewsResponse {
  reviews: UserReview[];
}

// GET /api/notifications
export type NotificationType =
  | 'booking'
  | 'booking_confirmed'
  | 'cancel'
  | 'rate_reminder'
  | 'trip_new'
  | 'license_approved'
  | 'license_rejected';

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  ref_trip_id: number | null;
  ref_user_id: number | null;
  created_at: string;
}

export interface GetNotificationsResponse {
  notifications: NotificationItem[];
}

// POST /api/notifications/read
export interface MarkNotificationReadRequest {
  notificationId: number;
}

export interface MarkNotificationReadResponse {
  success: boolean;
}

// DELETE /api/notifications/:id (issue #337)
export interface DeleteNotificationResponse {
  success: boolean;
}

// POST /api/notifications/clear (issue #337)
export interface ClearNotificationsResponse {
  success: boolean;
  deletedCount?: number;
}

// GET /api/me/cars
export interface Car {
  id: number;
  model: string;
  color: string | null;
  plate: string | null;
}

export interface GetMyCarsResponse {
  cars: Car[];
}

// POST /api/me/cars
export interface AddCarRequest {
  model: string;
  color?: string | null;
  plate?: string | null;
}

export interface AddCarResponse {
  car: Car;
}

// POST /api/trips/:id/cancel
export interface CancelTripResponse {
  result: {
    tripId: number;
    cancelledBookings: number;
  };
}

// Авторизация (issue #242)
export interface AuthUser {
  id: number;
  name: string;
  email: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  firstName: string;
  lastName: string;
  pdnConsent: boolean;
  pdnConsentVersion: string;
  marketingConsent: boolean;
  marketingConsentVersion?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
}

// GET /api/me/credentials — статус входа по email текущего пользователя (#273).
export interface GetMyCredentialsResponse {
  /** true — вход по email уже настроен (у аккаунта есть пароль). */
  hasPassword: boolean;
  email: string | null;
  username: string | null;
}

// POST /api/me/credentials — добавить email+username+пароль к своему аккаунту (#273).
export interface AddCredentialsRequest {
  email: string;
  username: string;
  password: string;
}

export interface AddCredentialsResponse {
  user: AuthUser;
}

/** Привязка ранее заведённой браузерной учётки к TG-карточке (issue #300). */
export interface LinkAccountRequest {
  email: string;
  password: string;
}

export interface LinkAccountResponse {
  linked: boolean;
  email: string;
  username: string | null;
}

// Ошибки
export interface ApiErrorResponse {
  error: string;
  /** Машинно-различимый код (напр. email_taken, username_taken, invalid_credentials). */
  code?: string;
  [key: string]: unknown;
}
