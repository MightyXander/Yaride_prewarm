import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { lazy } from 'react';
import IntroScreen from '../screens/IntroScreen';
import MainScreen from '../screens/MainScreen';
// Не-стартовые экраны грузим лениво (code-splitting) — режет initial-бандл и TTI.
// IntroScreen и MainScreen остаются в основном бандле (первый рендер).
const TripDetailsScreen = lazy(() => import('../screens/TripDetailsScreen'));
const BookingProfileScreen = lazy(() => import('../screens/BookingProfileScreen'));
const DriverPublishScreen = lazy(() => import('../screens/DriverPublishScreen'));
const BookingConfirmedScreen = lazy(() => import('../screens/BookingConfirmedScreen'));
const ProfileScreen = lazy(() => import('../screens/ProfileScreen'));
const BecomeDriverScreen = lazy(() => import('../screens/BecomeDriverScreen'));
const LicenseReviewScreen = lazy(() => import('../screens/LicenseReviewScreen'));
const SafetyScreen = lazy(() => import('../screens/SafetyScreen'));
const PassengerRequestScreen = lazy(() => import('../screens/PassengerRequestScreen'));
const RequestPublishedScreen = lazy(() => import('../screens/RequestPublishedScreen'));
const MyTripsScreen = lazy(() => import('../screens/MyTripsScreen'));
const RateTripScreen = lazy(() => import('../screens/RateTripScreen'));
const UserProfileScreen = lazy(() => import('../screens/UserProfileScreen'));
const NotificationsScreen = lazy(() => import('../screens/NotificationsScreen'));
const AddCarScreen = lazy(() => import('../screens/AddCarScreen'));
const MyCarsScreen = lazy(() => import('../screens/MyCarsScreen'));
const MyAlertsScreen = lazy(() => import('../screens/MyAlertsScreen'));
const AuthGateScreen = lazy(() => import('../screens/AuthGateScreen'));
const LoginScreen = lazy(() => import('../screens/LoginScreen'));
const RegisterScreen = lazy(() => import('../screens/RegisterScreen'));

import type { AsyncState } from '../hooks/useAsync';
import type { ThemeMode } from '../hooks/useTheme';
import { formatSubtitle } from './date';
import { dayWord } from './dateLocal';
import type { UserRole } from './role';
import type { RegisterPayload } from '../screens/RegisterScreen';
import type { BookingResult, NotificationType } from '../types/api';
import type { ConfirmKind, PublishedTripSummary, RatingContext, Screen, Trip } from '../types/navigation';

/** Сигнатура navigate из useNavigation — переиспользуется реестром и хендлер-хуками. */
export type NavigateFn = (
  screen: Screen,
  trip?: Trip | null,
  confirmKind?: ConfirmKind,
  publishedTripId?: number,
  backTo?: Screen
) => void;

export type NavigateToRateTripFn = (ratingContext: RatingContext) => void;

/**
 * Контекст, который App.tsx собирает из своих хуков/состояния и передаёт в
 * реестр экранов. Каждый рендерер реестра берёт из него ровно то, что нужно
 * конкретному экрану — сам App не знает деталей отдельных экранов (#290).
 */
export interface ScreenCtx {
  navigate: NavigateFn;
  goBack: () => void;
  navigateToRateTrip: NavigateToRateTripFn;

  selectedTrip: Trip | null;
  confirmKind: ConfirmKind;
  publishedTripId: number | null;
  ratingContext: RatingContext | null;

  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  userRole: UserRole | null;

  mainDirection: 'morning' | 'evening';
  setMainDirection: Dispatch<SetStateAction<'morning' | 'evening'>>;
  selectedDate: string;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  morningTrips: Trip[];
  eveningTrips: Trip[];
  morningTripsState: AsyncState<Trip[]> & { retry: () => void };
  eveningTripsState: AsyncState<Trip[]> & { retry: () => void };
  morningFirstLoading: boolean;
  eveningFirstLoading: boolean;
  morningFirstError: boolean;
  eveningFirstError: boolean;

  requestDirection: 'morning' | 'evening';
  setRequestDirection: Dispatch<SetStateAction<'morning' | 'evening'>>;

  currentBooking: BookingResult | null;
  publishedTrip: PublishedTripSummary | null;
  handleBookingConfirm: (booking: BookingResult) => void;
  handlePublish: (summary: PublishedTripSummary) => void;

  handleRoleSelect: (role: UserRole) => void;
  handleBecomeDriver: () => void;

  handleAuthLogin: (email: string, password: string) => Promise<void>;
  handleAuthRegister: (payload: RegisterPayload) => Promise<void>;
  handleLogout: () => Promise<void>;
  gateContext: boolean;

  handleOpenUserProfile: (userId: number) => void;
  profileStack: number[];

  handleOpenTripById: (tripId: number, backTo?: Screen) => Promise<void>;
  handleCancelOwnTrip: () => Promise<void>;
  handleCancelAlert: () => Promise<void>;
  handleNotificationNavigate: (
    type: NotificationType,
    refTripId?: number | null,
    refUserId?: number | null
  ) => void;

  /**
   * Пассажир, чью бронь нужно подсветить блюр-сценкой (BookingSpotlight) при
   * заходе в TripDetailsScreen из уведомления о новой брони (issue #339).
   * null — сценка не играется. Сбрасывается самим экраном по завершении/тапу.
   */
  bookingFocusUserId: number | null;
  setBookingFocusUserId: (userId: number | null) => void;
}

type ScreenRenderer = (ctx: ScreenCtx) => ReactNode;

/**
 * Реестр экранов: Screen → рендер-функция. Заменяет цепочку из 26 условных
 * `currentScreen === '...' && <Screen .../>` в App.tsx (issue #290).
 * Экраны без записи (напр. 'empty-state', 'alert-push', 'habit-home' — служебные
 * значения Screen, использующиеся только как таргеты навигации) не рендерятся,
 * как и раньше (ни одна ветка на них не совпадала).
 */
export const screenRegistry: Partial<Record<Screen, ScreenRenderer>> = {
  'auth-gate': (ctx) => (
    <AuthGateScreen onLogin={() => ctx.navigate('login')} onRegister={() => ctx.navigate('register')} />
  ),
  login: (ctx) => (
    <LoginScreen onSubmit={ctx.handleAuthLogin} onRegister={() => ctx.navigate('register')} />
  ),
  register: (ctx) => <RegisterScreen onSubmit={ctx.handleAuthRegister} onLogin={() => ctx.navigate('login')} />,
  intro: (ctx) => <IntroScreen onRoleSelect={ctx.handleRoleSelect} />,
  main: (ctx) => (
    <MainScreen
      trips={ctx.mainDirection === 'morning' ? ctx.morningTrips : ctx.eveningTrips}
      title={ctx.mainDirection === 'morning' ? 'Брагино → Центр' : 'Центр → Брагино'}
      subtitle={
        ctx.mainDirection === 'morning'
          ? formatSubtitle('утро 7:30–8:40', false, new Date(`${ctx.selectedDate}T00:00:00`))
          : formatSubtitle('вечер 17:00–18:30', false, new Date(`${ctx.selectedDate}T00:00:00`))
      }
      heroKicker={
        ctx.mainDirection === 'morning'
          ? `${dayWord(ctx.selectedDate)} по маршруту`
          : `${dayWord(ctx.selectedDate)} домой`
      }
      loading={
        ctx.mainDirection === 'morning'
          ? ctx.morningFirstLoading
          : ctx.eveningFirstLoading
      }
      error={
        ctx.mainDirection === 'morning'
          ? ctx.morningFirstError && ctx.morningTripsState.status === 'error'
            ? ctx.morningTripsState.error
            : undefined
          : ctx.eveningFirstError && ctx.eveningTripsState.status === 'error'
            ? ctx.eveningTripsState.error
            : undefined
      }
      onRetry={ctx.mainDirection === 'morning' ? ctx.morningTripsState.retry : ctx.eveningTripsState.retry}
      onTripClick={(trip) => ctx.navigate('trip-details', trip)}
      onPublish={() => ctx.navigate(ctx.mainDirection === 'evening' ? 'evening-publish' : 'driver-publish')}
      onLeaveRequest={() => {
        ctx.setRequestDirection(ctx.mainDirection);
        ctx.navigate('passenger-request');
      }}
      onToggleDirection={() => {
        window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light');
        ctx.setMainDirection((prev) => (prev === 'morning' ? 'evening' : 'morning'));
      }}
      userRole={ctx.userRole ?? 'passenger'}
      onOpenProfile={ctx.handleOpenUserProfile}
      selectedDate={ctx.selectedDate}
      onSelectDate={(date) => {
        window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light');
        ctx.setSelectedDate(date);
      }}
    />
  ),
  'main-more': (ctx) => (
    <MainScreen
      trips={ctx.morningTrips}
      subtitle={formatSubtitle('утро 7:30–8:40', true)}
      loading={ctx.morningTripsState.status === 'loading'}
      error={ctx.morningTripsState.status === 'error' ? ctx.morningTripsState.error : undefined}
      onRetry={ctx.morningTripsState.retry}
      onTripClick={(trip) => ctx.navigate('trip-details', trip)}
      onPublish={() => ctx.navigate('driver-publish')}
      onLeaveRequest={() => ctx.navigate('passenger-request')}
      userRole={ctx.userRole ?? 'passenger'}
      onOpenProfile={ctx.handleOpenUserProfile}
    />
  ),
  'trip-details': (ctx) =>
    ctx.selectedTrip ? (
      <TripDetailsScreen
        trip={ctx.selectedTrip}
        onBook={() => ctx.navigate('booking-profile')}
        onOpenProfile={ctx.handleOpenUserProfile}
        onCancelTrip={ctx.handleCancelOwnTrip}
        bookingFocusUserId={ctx.bookingFocusUserId}
        onClearBookingFocus={() => ctx.setBookingFocusUserId(null)}
      />
    ) : null,
  'booking-profile': (ctx) =>
    ctx.selectedTrip ? (
      <BookingProfileScreen trip={ctx.selectedTrip} onConfirm={ctx.handleBookingConfirm} />
    ) : null,
  'driver-publish': (ctx) => (
    <DriverPublishScreen onPublish={ctx.handlePublish} onAddCar={() => ctx.navigate('add-car')} />
  ),
  'booking-confirmed': (ctx) => (
    <BookingConfirmedScreen
      kind={ctx.confirmKind}
      trip={ctx.selectedTrip}
      booking={ctx.confirmKind === 'booking' ? ctx.currentBooking : null}
      publishedTripId={ctx.confirmKind === 'publish' ? (ctx.publishedTripId ?? undefined) : undefined}
      publishedTrip={ctx.confirmKind === 'publish' ? ctx.publishedTrip : null}
      onDone={() => ctx.navigate('main')}
      // «Брони на рейс» ведёт в единый экран поездки (issue #339, driver-bookings
      // удалён): дозагружаем полную карточку опубликованной поездки и открываем
      // её же trip-details, где для isOwn показана секция «Брони».
      onViewBookings={
        ctx.publishedTripId ? () => void ctx.handleOpenTripById(ctx.publishedTripId!, 'main') : undefined
      }
    />
  ),
  profile: (ctx) => (
    <ProfileScreen
      onBecomeDriver={ctx.handleBecomeDriver}
      onLicenseReview={() => ctx.navigate('license-review')}
      onSafety={() => ctx.navigate('safety')}
      onMyTrips={() => ctx.navigate('my-trips')}
      onMyCars={() => ctx.navigate('my-cars')}
      onMyAlerts={() => ctx.navigate('my-alerts')}
      themeMode={ctx.themeMode}
      onSetThemeMode={ctx.setThemeMode}
      theme={ctx.theme}
      onOpenProfile={ctx.handleOpenUserProfile}
      onLogout={ctx.gateContext ? ctx.handleLogout : undefined}
    />
  ),
  'become-driver': (ctx) => <BecomeDriverScreen onSubmit={() => ctx.navigate('license-review')} />,
  'license-review': (ctx) => (
    <LicenseReviewScreen onFindRide={() => ctx.navigate('main')} onRetry={() => ctx.navigate('become-driver')} />
  ),
  safety: () => <SafetyScreen />,
  'passenger-request': (ctx) => (
    <PassengerRequestScreen
      direction={ctx.requestDirection}
      // alertId из ответа POST /api/alerts прокидываем в общий слот publishedTripId
      // навигации (issue #319) — тот же механизм, что уже использует
      // BookingConfirmedScreen для «последнего опубликованного id».
      onPublish={(alertId) => ctx.navigate('request-published', null, undefined, alertId)}
    />
  ),
  // onCancel вызывает реальную отмену заявки на сервере (issue #319) и уже потом
  // навигирует на 'main' (не ctx.goBack): PARENT_SCREEN['request-published'] ведёт
  // на служебное значение 'empty-state', у которого нет записи в реестре — это
  // давало белый экран после отмены заявки (issue #317). 'main' — реальный домашний
  // экран, который сам показывает актуальный empty-state «Оставить заявку» по
  // данным из API.
  'request-published': (ctx) => (
    <RequestPublishedScreen
      alertId={ctx.publishedTripId}
      onEdit={() => ctx.navigate('passenger-request')}
      onCancel={ctx.handleCancelAlert}
    />
  ),
  'my-trips': (ctx) => (
    <MyTripsScreen
      onCreateTrip={() => ctx.navigate('driver-publish')}
      onOpenTrip={ctx.handleOpenTripById}
      onRateTrip={(tripId, rateeId, raterRole) => ctx.navigateToRateTrip({ tripId, rateeId, raterRole })}
    />
  ),
  'rate-trip': (ctx) => (
    <RateTripScreen ratingContext={ctx.ratingContext ?? undefined} onSubmit={ctx.goBack} onClose={ctx.goBack} />
  ),
  'evening-main': (ctx) => (
    <MainScreen
      trips={ctx.eveningTrips}
      title="Центр → Брагино"
      subtitle={formatSubtitle('вечер 17:30–19:00')}
      heroKicker={`${dayWord(ctx.selectedDate)} домой`}
      loading={ctx.eveningFirstLoading}
      error={ctx.eveningFirstError && ctx.eveningTripsState.status === 'error' ? ctx.eveningTripsState.error : undefined}
      onRetry={ctx.eveningTripsState.retry}
      onTripClick={(trip) => ctx.navigate('trip-details', trip)}
      onPublish={() => ctx.navigate('evening-publish')}
      onLeaveRequest={() => ctx.navigate('passenger-request')}
      userRole={ctx.userRole ?? 'passenger'}
      onOpenProfile={ctx.handleOpenUserProfile}
    />
  ),
  'evening-publish': (ctx) => (
    <DriverPublishScreen
      title="Я за рулём · домой"
      timeOptions={['17:30', '17:40', '18:00', '18:30', 'другое']}
      defaultTime="17:40"
      routeLabel="Маршрут · обратный, из шаблона"
      defaultPickup="volkova"
      reverse={true}
      onPublish={ctx.handlePublish}
      onAddCar={() => ctx.navigate('add-car')}
    />
  ),
  'user-profile': (ctx) =>
    ctx.profileStack.length > 0 ? (
      <UserProfileScreen
        userId={ctx.profileStack[ctx.profileStack.length - 1]}
        depth={ctx.profileStack.length - 1}
        onOpenProfile={ctx.handleOpenUserProfile}
      />
    ) : null,
  notifications: (ctx) => <NotificationsScreen onNavigate={ctx.handleNotificationNavigate} />,
  'my-cars': (ctx) => <MyCarsScreen onAddCar={() => ctx.navigate('add-car', null, undefined, undefined, 'my-cars')} />,
  'add-car': (ctx) => <AddCarScreen onSaved={ctx.goBack} />,
  'my-alerts': (ctx) => (
    <MyAlertsScreen
      onCreateAlert={() => {
        ctx.setRequestDirection(ctx.mainDirection);
        ctx.navigate('passenger-request');
      }}
    />
  ),
};
