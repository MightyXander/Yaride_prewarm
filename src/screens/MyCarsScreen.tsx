import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { LoadErrorState, EmptyState } from '../components/ui/StateView';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { Skeleton } from '../components/ui/Skeleton';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { hapticImpact } from '../lib/haptics';
import { getMyCars, ApiException } from '../lib/api';
import type { Car } from '../types/api';
import { Appear, AppearList } from '../components/Appear';

interface MyCarsScreenProps {
  /** Перейти к форме добавления машины. */
  onAddCar?: () => void;
}

// Демо-данные для браузера без Telegram (graceful fallback при 401).
const DEMO_CARS: Car[] = [
  { id: 1, model: 'Лада Веста', color: 'чёрный', plate: 'А567РУ' },
];

const MyCarsScreen: React.FC<MyCarsScreenProps> = ({ onAddCar }) => {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadCars = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getMyCars();
      setCars(res.cars);
    } catch (err) {
      // 401 (браузер без Telegram) — graceful демо-фолбэк; иначе — состояние ошибки.
      if (err instanceof ApiException && err.status === 401) {
        setCars(DEMO_CARS);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCars();
  }, [loadCars]);

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: `6px 16px ${FLOATING_NAV_SCROLL_CLEARANCE}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Header title="Мои машины" />

      <AnimatePresence mode="wait">
        {loading ? (
          <Appear key="loading-skeleton" instant>
            <>
              {[1, 2].map((i) => (
                <Card key={i} style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '64px', marginBottom: '12px' }}>
                  <Skeleton h={18} w="55%" r={9} />
                  <Skeleton h={14} w="40%" r={7} />
                </Card>
              ))}
            </>
          </Appear>
        ) : error ? (
          <Appear key="error" animateKey="error">
            <LoadErrorState onRetry={() => { void loadCars(); }} />
          </Appear>
        ) : cars.length === 0 ? (
          <Appear key="empty" animateKey="empty">
            <EmptyState
              icon={
                <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
                  <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
                  <path d="M5 11h14v6H5z" />
                  <circle cx="7.5" cy="17.5" r="1.5" />
                  <circle cx="16.5" cy="17.5" r="1.5" />
                </svg>
              }
              title="Пока нет машин"
              subtitle="Добавьте машину, чтобы публиковать поездки как водитель."
            />
          </Appear>
        ) : (
          <AppearList key="cars" animateKey="cars" stagger={40} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cars.map((car) => (
              <Card key={car.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  aria-hidden
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '13px',
                    background: 'var(--secondary)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--foreground)',
                    flexShrink: 0,
                  }}
                >
                  <Icon id="i-car" style={{ width: '20px', height: '20px' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {car.model}
                    {car.color ? <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}> · {car.color}</span> : null}
                  </div>
                  {car.plate && (
                    <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '2px', letterSpacing: '0.04em' }}>
                      {car.plate}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </AppearList>
        )}
      </AnimatePresence>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button
          variant="primary"
          icon="i-plus"
          onClick={() => {
            hapticImpact('light');
            onAddCar?.();
          }}
        >
          Добавить машину
        </Button>
      </div>
    </div>
  );
};

export default MyCarsScreen;
