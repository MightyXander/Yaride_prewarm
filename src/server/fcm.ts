/**
 * Отправка push-уведомлений через Firebase Cloud Messaging (issue #265).
 *
 * Серверный ключ (service account) берётся из env FIREBASE_SERVICE_ACCOUNT
 * (JSON одной строкой). Если не задан — модуль no-op (пуши просто не шлются,
 * остальной бэкенд работает). Инициализация ленивая, один раз.
 *
 * Токены устройств хранит таблица push_tokens; невалидные токены чистятся по
 * ответу FCM.
 */
import { initializeApp, cert, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { getUserPushTokens, deletePushTokens } from './repo.ts';

let app: App | null = null;
let initTried = false;

function getApp(): App | null {
  if (initTried) {
    return app;
  }
  initTried = true;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim();
  if (raw === '') {
    console.log('[fcm] FIREBASE_SERVICE_ACCOUNT не задан — пуши отключены');
    return null;
  }
  try {
    const cred = JSON.parse(raw) as ServiceAccount;
    app = initializeApp({ credential: cert(cred) });
    console.log('[fcm] firebase-admin инициализирован');
  } catch (e) {
    console.error('[fcm] init failed:', e instanceof Error ? e.message : e);
    app = null;
  }
  return app;
}

/**
 * Отправить пуш всем устройствам пользователя. Best-effort: ошибки логируются,
 * не пробрасываются. Невалидные токены удаляются из push_tokens.
 */
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const a = getApp();
  if (a === null) {
    return;
  }
  let tokens: string[];
  try {
    tokens = await getUserPushTokens(userId);
  } catch (e) {
    console.error('[fcm] getUserPushTokens failed:', e instanceof Error ? e.message : e);
    return;
  }
  if (tokens.length === 0) {
    return;
  }
  try {
    const res = await getMessaging(a).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: { priority: 'high' },
    });
    const invalid: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token') ||
          code.includes('invalid-argument')
        ) {
          invalid.push(tokens[i]);
        }
      }
    });
    if (invalid.length > 0) {
      await deletePushTokens(invalid);
    }
  } catch (e) {
    console.error('[fcm] send failed:', e instanceof Error ? e.message : e);
  }
}
