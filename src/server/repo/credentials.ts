/**
 * Учётные данные пользователя (TG→браузер мост, issue #273): статус входа
 * по email, добавление email/пароля к существующему TG-аккаунту.
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';
import { UserConflictError, type WebUserRecord } from './users.ts';

/**
 * Уже задан вход по email (есть password_hash) у аккаунта, к которому пытаются
 * добавить email/пароль. Управление/смена пароля — вне MVP (issue #273), поэтому
 * повторная установка → 409 already_set.
 */
export class CredentialsAlreadySetError extends Error {
  constructor() {
    super('credentials_already_set');
    this.name = 'CredentialsAlreadySetError';
  }
}

/** Срез учётных данных текущего пользователя для UI (без password_hash). */
export interface UserCredentialsStatus {
  /** true — вход по email уже настроен (password_hash IS NOT NULL). */
  hasPassword: boolean;
  email: string | null;
  username: string | null;
}

/**
 * Статус учётных данных пользователя по внутреннему id (для GET /api/me/credentials).
 * Возвращает null, если пользователь не найден. hasPassword нужен фронту, чтобы
 * показать секцию «Вход по email» только аккаунтам без пароля; username — префилл.
 */
export async function getUserCredentials(
  userId: number,
): Promise<UserCredentialsStatus | null> {
  await ensureReady();
  const res = await getPool().query<{
    email: string | null;
    username: string | null;
    password_hash: string | null;
  }>(
    'SELECT email, username, password_hash FROM users WHERE id = $1',
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return {
    hasPassword: row.password_hash !== null,
    email: row.email,
    username: row.username,
  };
}

export interface AddCredentialsParams {
  userId: number;
  email: string;
  username: string;
  /** Уже посчитанный scrypt-хеш (репозиторий пароль в открытом виде не видит). */
  passwordHash: string;
}

/**
 * Добавить вход по email (email + username + password_hash) к СУЩЕСТВУЮЩЕМУ
 * аккаунту без пароля (TG→браузер, issue #273). Единая users-карточка: рейтинг,
 * поездки и tg_user_id сохраняются — добавляются только поля веб-входа.
 *
 * Инварианты:
 *  - Применимо только к аккаунту с password_hash IS NULL; иначе CredentialsAlreadySetError
 *    (управление/смена — вне MVP). Строка блокируется FOR UPDATE, чтобы две
 *    параллельные установки не прошли обе.
 *  - email уникален среди ВСЕХ аккаунтов (uq_users_email_lower, email IS NOT NULL).
 *  - username уникален среди ВЕБ-аккаунтов (uq_users_username_lower, password_hash IS NOT NULL):
 *    как только мы проставляем password_hash, строка попадает под этот индекс, поэтому
 *    username обязателен и должен быть свободен среди веб-аккаунтов (совпадение с
 *    историческим TG-снимком другого пользователя — допустимо).
 *  - Конфликты дублируются уникальными индексами (catch 23505 как защита от гонок).
 */
export async function addUserCredentials(
  params: AddCredentialsParams,
): Promise<WebUserRecord> {
  await ensureReady();
  const email = params.email.trim();
  const username = params.username.trim();

  return withTransaction(async (client): Promise<WebUserRecord> => {
    const cur = await client.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
      [params.userId],
    );
    const row = cur.rows[0];
    if (!row) {
      throw new Error('Профиль не найден.');
    }
    if (row.password_hash !== null) {
      throw new CredentialsAlreadySetError();
    }

    // email: уникальность среди всех аккаунтов (исключая себя — у TG-строки email=NULL).
    const emailRes = await client.query(
      'SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1',
      [email, params.userId],
    );
    if ((emailRes.rowCount ?? 0) > 0) {
      throw new UserConflictError('email_taken');
    }
    // username: конфликт только среди ВЕБ-аккаунтов (совпадает с uq_users_username_lower).
    const unameRes = await client.query(
      'SELECT 1 FROM users WHERE lower(username) = lower($1) AND password_hash IS NOT NULL AND id <> $2 LIMIT 1',
      [username, params.userId],
    );
    if ((unameRes.rowCount ?? 0) > 0) {
      throw new UserConflictError('username_taken');
    }

    try {
      const upd = await client.query<WebUserRecord>(
        `UPDATE users
            SET email = $1, username = $2, password_hash = $3
          WHERE id = $4 AND password_hash IS NULL
        RETURNING id, name, email, username, first_name, last_name`,
        [email, username, params.passwordHash, params.userId],
      );
      const updated = upd.rows[0];
      if (!updated) {
        // Гонка: password_hash проставили между SELECT FOR UPDATE и UPDATE.
        throw new CredentialsAlreadySetError();
      }
      return updated;
    } catch (e) {
      const constraint = e as { code?: string; constraint?: string };
      if (constraint.code === '23505') {
        if (constraint.constraint === 'uq_users_username_lower') {
          throw new UserConflictError('username_taken');
        }
        throw new UserConflictError('email_taken');
      }
      throw e;
    }
  });
}
