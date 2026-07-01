import { useState } from 'react';
import type { NavigateFn } from '../lib/screenRegistry';
import type { BookingResult } from '../types/api';
import type { PublishedTripSummary } from '../types/navigation';

interface UsePublishHandlersArgs {
  navigate: NavigateFn;
}

/**
 * Состояние + хендлеры для флоу подтверждения: бронь пассажира (booking-profile →
 * booking-confirmed) и публикация поездки водителем (driver-publish/evening-publish →
 * booking-confirmed). Вынесено из App.tsx (#290).
 */
export function usePublishHandlers({ navigate }: UsePublishHandlersArgs) {
  // Текущая бронь (для передачи из booking-profile в booking-confirmed)
  const [currentBooking, setCurrentBooking] = useState<BookingResult | null>(null);
  // Сводка последней опубликованной поездки — для экрана «Поездка опубликована».
  const [publishedTrip, setPublishedTrip] = useState<PublishedTripSummary | null>(null);

  const handleBookingConfirm = (booking: BookingResult) => {
    setCurrentBooking(booking);
    navigate('booking-confirmed', null, 'booking');
  };

  const handlePublish = (summary: PublishedTripSummary) => {
    setPublishedTrip(summary);
    navigate('booking-confirmed', null, 'publish', summary.tripId);
  };

  return { currentBooking, publishedTrip, handleBookingConfirm, handlePublish };
}
