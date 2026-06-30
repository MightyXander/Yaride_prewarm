import Button from '../components/ui/Button';
import { BrandLogo, TelegramButton } from '../components/AuthKit';
import { hapticImpact } from '../lib/haptics';

/**
 * AuthGateScreen — стартовый выбор для браузерных пользователей без Telegram.
 * Презентационный: все действия — через props-колбэки (без обращений к backend).
 */
interface AuthGateScreenProps {
  onTelegram: () => void;
  onLogin: () => void;
  onRegister: () => void;
}

const AuthGateScreen: React.FC<AuthGateScreenProps> = ({ onTelegram, onLogin, onRegister }) => {
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '18px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '28px',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
        <BrandLogo size={46} wordSize={22} center />
        <div>
          <h1 style={{ margin: 0, fontSize: '31px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Поехали вместе
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: '15px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            По одному маршруту — вместе выгоднее
          </p>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <TelegramButton
          onClick={() => {
            hapticImpact('medium');
            onTelegram();
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '2px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          <span style={{ fontSize: '13px', color: 'var(--muted-foreground)', fontWeight: 600 }}>или</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>

        <Button
          variant="ghost"
          onClick={onLogin}
          style={{
            minHeight: '52px',
            borderRadius: '16px',
            background: 'var(--card)',
            border: '1.5px solid var(--field-border)',
            fontWeight: 600,
          }}
        >
          Войти по email
        </Button>
        <Button
          variant="ghost"
          onClick={onRegister}
          style={{
            minHeight: '52px',
            borderRadius: '16px',
            background: 'var(--card)',
            border: '1.5px solid var(--field-border)',
            fontWeight: 600,
          }}
        >
          Создать аккаунт
        </Button>
      </div>

      <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted-foreground)', lineHeight: 1.5, maxWidth: '300px' }}>
        Продолжая, вы принимаете{' '}
        <a
          href="/privacy"
          style={{ color: 'var(--muted-foreground)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
        >
          Политику конфиденциальности
        </a>
      </p>
    </div>
  );
};

export default AuthGateScreen;
