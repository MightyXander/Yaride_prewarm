import { useState, useEffect, useRef } from 'react';
import { Icons } from './components/Icons';
import Topbar from './components/Topbar';
import Hero from './components/Hero';
import TripCard from './components/TripCard';
import Button from './components/ui/Button';

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        colorScheme: 'light' | 'dark';
        onEvent: (eventType: string, callback: () => void) => void;
        offEvent: (eventType: string, callback: () => void) => void;
      };
    };
  }
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (window.Telegram?.WebApp) {
      return window.Telegram.WebApp.colorScheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const firstTripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setTheme(tg.colorScheme);

      const handleThemeChange = () => {
        setTheme(tg.colorScheme);
      };
      tg.onEvent('themeChanged', handleThemeChange);

      return () => {
        tg.offEvent('themeChanged', handleThemeChange);
      };
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const trips = [
    {
      driver: {
        name: 'Андрей К.',
        rating: 4.9,
        tripCount: 37,
        avatar: 'А',
      },
      address: 'ул. Урицкого, 12',
      car: 'Kia Rio',
      price: '80',
      time: '7:40',
      seats: 2,
    },
    {
      driver: {
        name: 'Марина С.',
        rating: 5.0,
        tripCount: 12,
        avatar: 'М',
      },
      address: 'пр-т Дзержинского, 8',
      car: 'VW Polo',
      price: '70',
      time: '7:55',
      seats: 3,
    },
  ];

  const scrollToFirstTrip = () => {
    if (firstTripRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      firstTripRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

  return (
    <div className={theme}>
      <Icons />
      <div
        style={{
          maxWidth: '390px',
          margin: '0 auto',
          background: 'var(--background)',
          color: 'var(--foreground)',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            padding: '6px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <Topbar title="Брагино → Центр" subtitle="среда, утро 7:30–8:40" />
          <Hero
            subtitle="Сегодня по маршруту"
            title={
              <>
                3 поездки
                <br />в твою сторону
              </>
            }
            ctaText="Ближайшая в 7:40"
            onCtaClick={scrollToFirstTrip}
          />
          {trips.map((trip, index) => (
            <TripCard key={index} {...trip} ref={index === 0 ? firstTripRef : null} />
          ))}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
              marginTop: 'auto',
              paddingTop: '6px',
            }}
          >
            <Button variant="primary" icon="i-car">
              Возьму попутчиков
            </Button>
            <Button variant="secondary" icon="i-search">
              Ищу, кто подвезёт
            </Button>
            {import.meta.env.DEV && (
              <Button
                variant="ghost"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                style={{
                  minHeight: '36px',
                  fontSize: '12px',
                  marginTop: '8px',
                }}
              >
                Переключить тему ({theme === 'dark' ? 'светлая' : 'тёмная'})
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
