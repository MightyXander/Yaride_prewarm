// Navigation types
export type Screen =
  | 'auth-gate'
  | 'login'
  | 'register'
  | 'intro'
  | 'main'
  | 'main-more'
  | 'trip-details'
  | 'empty-state'
  | 'booking-profile'
  | 'driver-publish'
  | 'booking-confirmed'
  | 'profile'
  | 'driver-bookings'
  | 'become-driver'
  | 'license-review'
  | 'in-trip'
  | 'safety'
  | 'passenger-request'
  | 'request-published'
  | 'alert-push'
  | 'my-trips'
  | 'rate-trip'
  | 'evening-main'
  | 'evening-publish'
  | 'habit-home'
  | 'user-profile'
  | 'notifications'
  | 'my-cars'
  | 'add-car'
  | 'my-alerts';

// Откуда пришли на экран подтверждения (бронь пассажира или публикация водителя)
export type ConfirmKind = 'booking' | 'publish';

export interface Trip {
  id: string;
  driver: {
    id?: number;
    name: string;
    rating: number;
    tripCount: number;
    avatar: string;
    age?: number;
    verified?: boolean;
    memberSince?: string;
  };
  address: string;
  /** Модель машины. null — модель не указана (плейсхолдер не показываем). */
  car: string | null;
  price: string;
  time: string;
  /** Дата поездки YYYY-MM-DD (для дня недели и определения прошедшей). */
  tripDate?: string;
  /** Статус поездки: open | cancelled | completed. */
  status?: string;
  seats: number;
  route?: {
    from: string;
    to: string;
    duration?: string;
  };
  isOwn: boolean;
  booked: boolean;
  carColor: string | null;
  plate: string | null;
  /** true — номер есть, но скрыт до брони (UI показывает цензуру вместо номера). */
  plateLocked?: boolean;
  /** Телефон водителя — приходит пассажиру с активной бронью (контур, что и plate), иначе null. */
  driverPhone?: string | null;
  /** true — телефон водителя есть, но скрыт до подтверждения брони (UI показывает мягкую подпись). */
  driverPhoneLocked?: boolean;
}

export interface RatingContext {
  tripId: number;
  rateeId: number;
  raterRole: 'driver' | 'passenger';
}

/**
 * Сводка только что опубликованной поездки — для экрана «Поездка опубликована».
 * Собирается в DriverPublishScreen из ответа publishTrip + выбранных точек маршрута,
 * чтобы экран подтверждения показывал реальные данные, а не демо-заглушку.
 */
export interface PublishedTripSummary {
  tripId: number;
  startTitle: string;
  endTitle: string;
  tripDate: string;
  departureTime: string;
  seatsTotal: number;
  priceRub: number;
}

export interface NavigationState {
  currentScreen: Screen;
  selectedTrip: Trip | null;
  confirmKind: ConfirmKind;
  scrollPositions: Record<Screen, number>;
  ratingContext: RatingContext | null;
  publishedTripId: number | null;
  /** Явный «назад»-таргет для экранов с несколькими источниками входа (напр. trip-details из main/my-trips/notifications). */
  backOverrides: Partial<Record<Screen, Screen>>;
}
