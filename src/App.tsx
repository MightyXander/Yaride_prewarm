import { useState } from 'react';
import { Icons } from './components/Icons';
import StatusBar from './components/StatusBar';
import Topbar from './components/Topbar';
import Hero from './components/Hero';
import TripCard from './components/TripCard';
import Button from './components/ui/Button';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

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

  return (
    <div className={theme}>
      <Icons />
      <div
        style={{
          maxWidth: '390px',
          margin: '0 auto',
          background: 'var(--background)',
          color: 'var(--foreground)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <StatusBar />
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
          />
          {trips.map((trip, index) => (
            <TripCard key={index} {...trip} />
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
