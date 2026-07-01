/**
 * Рейтинги после поездки: создание оценки + пересчёт агрегатов оцениваемого,
 * список отзывов о пользователе.
 * Вынесено из монолитного repo.ts (issue #289).
 */

import { ensureReady, getPool, withTransaction } from '../db.ts';
import { internalUserIdByTg } from './_shared.ts';

export interface UserReview {
  author_id: number;
  author_name: string;
  stars: number;
  comment: string | null;
  tags: string | null;
  created_at: string;
}

/**
 * Список отзывов о пользователе (для GET /api/users/:id/reviews).
 * Возвращает отзывы, отсортированные по дате (новые — первыми).
 */
export async function listUserReviews(userId: number): Promise<UserReview[]> {
  await ensureReady();
  const res = await getPool().query<UserReview>(
    `SELECT r.rater_id AS author_id, u.name AS author_name, r.stars, r.comment, r.tags, r.created_at
     FROM ratings r
     JOIN users u ON u.id = r.rater_id
     WHERE r.ratee_id = $1
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return res.rows;
}

export interface CreateRatingParams {
  tgRaterId: number;
  tripId: number;
  rateeId: number;
  stars: number;
  tags?: string | null;
  comment?: string | null;
}

export interface CreateRatingResult {
  ratingId: number;
  tripId: number;
  rateeId: number;
  stars: number;
  rateeNewAvg: number;
  rateeNewCount: number;
}

/**
 * Создать рейтинг после поездки. Оценивающий (rater) — по telegram-id, оцениваемый (ratee)
 * — по внутреннему id. После вставки рейтинга пересчитывается users.rating_avg/rating_count
 * у оцениваемого. UNIQUE(trip_id, rater_id, ratee_id) защищает от дублей.
 * Бросает Error при дублях, несуществующих пользователях/поездках, нарушении диапазона stars.
 */
export async function createRating(
  params: CreateRatingParams,
): Promise<CreateRatingResult> {
  const raterId = await internalUserIdByTg(params.tgRaterId);
  if (raterId === null) {
    throw new Error('Профиль оценивающего не найден.');
  }
  return createRatingById(raterId, params);
}

/** Рейтинг по внутреннему users.id оценивающего (мост сессии, issue #258). */
export async function createRatingById(
  raterId: number,
  params: Omit<CreateRatingParams, 'tgRaterId'>,
): Promise<CreateRatingResult> {
  await ensureReady();

  return withTransaction(async (client): Promise<CreateRatingResult> => {
    if (params.stars < 1 || params.stars > 5) {
      throw new Error('Оценка должна быть от 1 до 5 звёзд.');
    }

    // Проверить существование trip и ratee
    const tripCheck = await client.query<{ id: number }>(
      'SELECT id FROM trips WHERE id = $1',
      [params.tripId],
    );
    if (tripCheck.rows.length === 0) {
      throw new Error('Поездка не найдена.');
    }

    const rateeCheck = await client.query<{ id: number }>(
      'SELECT id FROM users WHERE id = $1',
      [params.rateeId],
    );
    if (rateeCheck.rows.length === 0) {
      throw new Error('Оцениваемый пользователь не найден.');
    }

    // Вставить рейтинг
    const ins = await client.query<{ id: number }>(
      `INSERT INTO ratings(trip_id, rater_id, ratee_id, stars, tags, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [params.tripId, raterId, params.rateeId, params.stars, params.tags ?? null, params.comment ?? null],
    );

    // Пересчитать агрегаты у ratee
    const aggRes = await client.query<{ avg: number; cnt: number }>(
      `SELECT COALESCE(AVG(stars), 0.0) AS avg, COUNT(*) AS cnt
       FROM ratings WHERE ratee_id = $1`,
      [params.rateeId],
    );
    const newAvg = Number(aggRes.rows[0].avg);
    const newCount = Number(aggRes.rows[0].cnt);

    await client.query(
      'UPDATE users SET rating_avg = $1, rating_count = $2 WHERE id = $3',
      [newAvg, newCount, params.rateeId],
    );

    return {
      ratingId: ins.rows[0].id,
      tripId: params.tripId,
      rateeId: params.rateeId,
      stars: params.stars,
      rateeNewAvg: newAvg,
      rateeNewCount: newCount,
    };
  });
}
