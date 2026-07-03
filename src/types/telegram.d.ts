// Telegram WebApp API types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        colorScheme: 'light' | 'dark';
        isVersionAtLeast: (version: string) => boolean;
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
          };
          start_param?: string;
        };
        onEvent: (eventType: string, callback: () => void) => void;
        offEvent: (eventType: string, callback: () => void) => void;
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        showAlert?: (message: string) => void;
        showPopup?: (params: { message: string; buttons?: Array<{ text: string }> }) => void;
        // openTelegramLink — для t.me-ссылок (deep-link в бота, t.me/share/url и т.п.):
        // Telegram обрабатывает их сам (нативный шит выбора чата и т.д.).
        // openLink — для произвольных внешних URL. Разные методы намеренно (Bot API docs).
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
      };
    };
  }
}

export {};
