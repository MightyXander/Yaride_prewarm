import { useState } from 'react';
import { Icons, Icon } from './components/Icons';
import StatusBar from './components/StatusBar';
import Topbar from './components/Topbar';
import Hero from './components/Hero';
import TripCard from './components/TripCard';

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
            <button
              style={{
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 600,
                fontSize: '13px',
                lineHeight: 1.15,
                textAlign: 'center',
                background: 'var(--gradient-brand)',
                color: '#18170f',
                boxShadow: 'var(--shadow-hero)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Icon id="i-car" /> Возьму попутчиков
            </button>
            <button
              style={{
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 600,
                fontSize: '13px',
                lineHeight: 1.15,
                textAlign: 'center',
                background: 'var(--secondary)',
                color: 'var(--secondary-foreground)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Icon id="i-search" /> Ищу, кто подвезёт
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{
                minHeight: '36px',
                padding: '6px 14px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'var(--accent)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                marginTop: '8px',
              }}
            >
              Переключить тему ({theme === 'dark' ? 'светлая' : 'тёмная'})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
