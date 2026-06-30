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
  | 'add-car';

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
  seats: number;
  route?: {
    from: string;
    to: string;
    duration?: string;
  };
  isOwn: boolean;
  carColor: string | null;
  plate: string | null;
}

export interface RatingContext {
  tripId: number;
  rateeId: number;
  raterRole: 'driver' | 'passenger';
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
