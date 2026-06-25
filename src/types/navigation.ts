// Navigation types
export type Screen = 'intro' | 'main' | 'trip-details' | 'empty-state';

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
  scrollPositions: Record<Screen, number>;
}
