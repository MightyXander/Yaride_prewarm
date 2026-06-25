// Navigation types
export type Screen =
  | 'intro'
  | 'main'
  | 'main-more'
  | 'trip-details'
  | 'empty-state'
  | 'booking-profile'
  | 'driver-publish'
  | 'booking-confirmed'
  | 'profile'
  | 'in-trip'
  | 'safety';

// Откуда пришли на экран подтверждения (бронь пассажира или публикация водителя)
export type ConfirmKind = 'booking' | 'publish';

export interface Trip {
  id: string;
  driver: {
    name: string;
    rating: number;
    tripCount: number;
    avatar: string;
    age?: number;
    verified?: boolean;
    memberSince?: string;
  };
  address: string;
  car: string;
  price: string;
  time: string;
  seats: number;
  route?: {
    from: string;
    to: string;
    duration?: string;
  };
}

export interface NavigationState {
  currentScreen: Screen;
  selectedTrip: Trip | null;
  confirmKind: ConfirmKind;
  scrollPositions: Record<Screen, number>;
}
