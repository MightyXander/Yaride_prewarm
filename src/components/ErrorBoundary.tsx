import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Страховка от «чёрного экрана» (баг-репорт: чёрный экран после публикации поездки).
 *
 * Контекст: экраны грузятся лениво (`lazy()` + `Suspense`, см. App.tsx, #227). Любая
 * необработанная ошибка рендера внутри лениво загруженного экрана — это типично:
 *   - сетевая/чанк-ошибка динамического импорта (ChunkLoadError) — особенно вероятна
 *     в долгоживущей Telegram WebView-сессии, когда Railway успел передеплоить прод
 *     между открытием mini-app и переходом на ещё не подгруженный экран (новый билд
 *     меняет хэши чанков — старый файл уже не существует на сервере);
 *   - разыменование поля, которого не оказалось в ответе API.
 * До этого компонента такая ошибка не была ничем перехвачена → React размонтировал
 * ВЕСЬ тree (включая BackButton/FloatingNav/ToastHost) → пустой экран, виден только
 * Telegram-хром. Чинилось это только перезапуском mini-app (свежий index.html/чанки).
 *
 * ErrorBoundary ловит ошибку локально (вокруг Suspense-блока экранов в App.tsx) и
 * показывает фолбэк с кнопкой «Обновить», а не роняет всё приложение целиком.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Меняется при смене текущего экрана. Если ошибка уже показана и пользователь
   * каким-то образом сменил экран (например, через BackButton/FloatingNav, которые
   * остаются живыми снаружи boundary), сбрасываем состояние ошибки, чтобы не залипнуть
   * в фолбэке навсегда.
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Необработанная ошибка рендера экрана:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '40px 24px',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: 'var(--secondary)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--muted-foreground)',
              flexShrink: 0,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{ width: '32px', height: '32px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}
              aria-hidden="true"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.01em' }}>
              Что-то пошло не так
            </div>
            <div
              style={{
                fontSize: '14.5px',
                color: 'var(--muted-foreground)',
                marginTop: '6px',
                lineHeight: 1.5,
                maxWidth: '280px',
              }}
            >
              Экран не загрузился. Обычно помогает обновление — данные и прогресс не теряются.
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="focus-ring pressable"
            style={{
              minHeight: '48px',
              padding: '0 22px',
              borderRadius: '18px',
              border: 'none',
              background: 'var(--gradient-brand)',
              color: 'var(--brand-foreground)',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-hero)',
            }}
          >
            Обновить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
