/**
 * Error state для ошибки загрузки поездок — по эталону (LoadErrorState + retry).
 */

import { LoadErrorState } from './ui/StateView';

interface ErrorTripsStateProps {
  onRetry: () => void;
  error?: Error;
}

const ErrorTripsState: React.FC<ErrorTripsStateProps> = ({ onRetry }) => (
  <LoadErrorState
    subtitle="Проверь соединение и попробуй ещё раз — поездки на месте."
    onRetry={onRetry}
  />
);

export default ErrorTripsState;
