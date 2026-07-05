import { useState, useEffect, useCallback } from 'react';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import Chip from '../components/ui/Chip';
import { Skeleton } from '../components/ui/Skeleton';
import { LoadErrorState, EmptyState } from '../components/ui/StateView';
import { FLOATING_NAV_SCROLL_CLEARANCE } from '../components/FloatingNav';
import { getUserProfile, getUserReviews } from '../lib/api';
import type { PublicUserProfile, UserReview } from '../types/api';

interface UserProfileScreenProps {
  /** ID пользователя для отображения профиля */
  userId: number;
  /** Глубина навигации (0 = корневой, 1 = первый уровень вложенности, 2 = максимум) */
  depth: number;
  /** Callback для открытия профиля автора отзыва (только если depth < 2) */
  onOpenProfile?: (userId: number) => void;
}

/**
 * UserProfileScreen — публичный профиль пользователя с отзывами.
 *
 * Шапка: крупный аватар + имя, возраст рядом с именем (если null — скрыть).
 * Ряд из 3 ячеек: поездки · рейтинг (★+число) · стаж («на сервисе 1 год 4 мес»).
 * Бейдж ВУ если license_verified.
 *
 * Отзывы: список — аватар+имя автора, дата «месяц год» (formatter), ★ 1–5, текст, опц. теги-чипы.
 * Загрузка — скелетоны карточек отзыва (та же геометрия, 0 сдвига). Пусто — «Пока нет отзывов».
 *
 * Глубина ≤2: вести стек просмотренных профилей. Тап по аватару автора отзыва открывает его профиль (уровень 2);
 * на уровне 2 авторы отзывов уже НЕ кликабельны. «Назад» снимает верхний профиль; на уровне 1 — выход на исходный экран.
 */
const UserProfileScreen: React.FC<UserProfileScreenProps> = ({ userId, depth, onOpenProfile }) => {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const loadData = useCallback(async () => {
    setProfileError(false);
    setLoadingProfile(true);
    setLoadingReviews(true);

    const pProfile = getUserProfile(userId)
      .then((res) => setProfile(res.profile))
      .catch((err) => {
        console.error('Ошибка загрузки профиля:', err);
        setProfileError(true);
      })
      .finally(() => setLoadingProfile(false));

    const pReviews = getUserReviews(userId)
      .then((res) => setReviews(res.reviews))
      .catch((err) => {
        console.error('Ошибка загрузки отзывов:', err);
      })
      .finally(() => setLoadingReviews(false));

    await Promise.all([pProfile, pReviews]);
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Форматирование даты отзыва: «месяц год» (например, «январь 2026»)
  const formatReviewDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    const monthNames = [
      'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${month} ${year}`;
  };

  // Склонение «год/года/лет» (возраст и стаж)
  const pluralYears = (n: number): string => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'год';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'года';
    return 'лет';
  };

  // Форматирование стажа: «на сервисе 1 год 4 мес» из joined_at
  const formatTenure = (isoDate: string): string => {
    const joined = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - joined.getTime();
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)); // средняя длина месяца

    if (diffMonths < 1) {
      return 'меньше месяца';
    }

    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;

    if (years === 0) {
      return `${months} мес`;
    }
    if (months === 0) {
      return `${years} ${pluralYears(years)}`;
    }
    return `${years} ${pluralYears(years)} ${months} мес`;
  };

  const avatar = profile ? profile.name.charAt(0).toUpperCase() : 'П';
  const name = profile?.name ?? 'Загрузка…';
  const age = profile?.age ?? null;
  const rating = profile?.rating ?? 0;
  const ratingCount = profile?.rating_count ?? 0;
  const tripsCount = profile?.trips_count ?? 0;
  const tenure = profile ? formatTenure(profile.joined_at) : '';
  const licenseVerified = profile?.license_verified ?? false;

  // Скелетон карточки отзыва (та же геометрия, что и реальный отзыв)
  const ReviewSkeleton: React.FC = () => (
    <Card style={{ padding: '14px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Skeleton w={40} h={40} r={999} />
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <Skeleton w="40%" h={14} r={7} />
            <Skeleton w="30%" h={12} r={6} />
          </div>
          <Skeleton w="100%" h={14} r={7} />
          <Skeleton w="80%" h={14} r={7} />
        </div>
      </div>
    </Card>
  );

  const canClickAuthor = depth < 2 && onOpenProfile;

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
      <Header title="Профиль" />

      {/* Шапка профиля */}
      {loadingProfile ? (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 14px', gap: '12px' }}>
          <Skeleton w={80} h={80} r={999} />
          <Skeleton w="50%" h={20} r={10} />
          <Skeleton w="70%" h={16} r={8} />
        </Card>
      ) : profileError ? (
        <LoadErrorState
          subtitle="Не удалось загрузить профиль. Проверь соединение и попробуй ещё раз."
          onRetry={() => { void loadData(); }}
        />
      ) : (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 14px', gap: '12px' }}>
          <Avatar label={avatar} rating={rating} size={80} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1.2 }}>
              {name}
              {age && (
                <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>
                  {' '}
                  · {age}&nbsp;{pluralYears(age)}
                </span>
              )}
            </div>
          </div>

          {/* Ряд из 3 ячеек: поездки · рейтинг · стаж */}
          <Card style={{ display: 'flex', alignItems: 'stretch', padding: 0, overflow: 'hidden', width: '100%' }}>
            <div style={{ flex: 1, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.1 }}>{tripsCount}</div>
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', fontWeight: 600, marginTop: '3px' }}>поездок</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }} />
            <div style={{ flex: 1, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.1, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <Icon id="i-star" fill style={{ width: '13px', height: '13px', fill: 'var(--star)' }} />
                {rating.toFixed(1)}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', fontWeight: 600, marginTop: '3px' }}>
                {ratingCount} {ratingCount === 1 ? 'отзыв' : ratingCount < 5 ? 'отзыва' : 'отзывов'}
              </div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }} />
            <div style={{ flex: 1, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.3 }}>{tenure}</div>
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', fontWeight: 600, marginTop: '3px' }}>на сервисе</div>
            </div>
          </Card>

          {/* Бейдж ВУ */}
          {licenseVerified && (
            <div
              style={{
                color: 'var(--success)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '14px',
              }}
            >
              <Icon id="i-check" style={{ width: '15px', height: '15px' }} />
              ВУ подтверждено
            </div>
          )}
        </Card>
      )}

      {/* Отзывы (скрыты при ошибке загрузки профиля) */}
      {!profileError && (
      <div style={{ marginTop: '4px' }}>
        <div
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--muted-foreground)',
            fontWeight: 700,
            marginBottom: '10px',
            paddingLeft: '2px',
          }}
        >
          Отзывы
        </div>

        {loadingReviews ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <ReviewSkeleton />
            <ReviewSkeleton />
            <ReviewSkeleton />
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            }
            title="Пока нет отзывов"
            subtitle="После поездок здесь появятся оценки и комментарии."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reviews.map((review, idx) => (
              <Card key={idx} style={{ padding: '14px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  {/* Аватар автора отзыва */}
                  <div
                    role={canClickAuthor ? 'button' : undefined}
                    tabIndex={canClickAuthor ? 0 : undefined}
                    aria-label={canClickAuthor ? `Открыть профиль ${review.author_name}` : undefined}
                    onClick={canClickAuthor ? (e) => {
                      e.stopPropagation();
                      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                      onOpenProfile?.(review.author_id);
                    } : undefined}
                    onKeyDown={canClickAuthor ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenProfile?.(review.author_id);
                      }
                    } : undefined}
                    style={{
                      flexShrink: 0,
                      cursor: canClickAuthor ? 'pointer' : 'default',
                    }}
                    className={canClickAuthor ? 'focus-ring pressable' : undefined}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '999px',
                        background: 'var(--gradient-brand)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '16px',
                        fontWeight: 800,
                        color: 'var(--brand-foreground)',
                      }}
                    >
                      {review.author_name.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Имя автора + дата */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {review.author_name}
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--muted-foreground)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatReviewDate(review.created_at)}
                      </div>
                    </div>

                    {/* Звёзды */}
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Icon
                          key={i}
                          id="i-star"
                          fill={i < review.stars}
                          style={{
                            width: '14px',
                            height: '14px',
                            fill: i < review.stars ? 'var(--star)' : 'none',
                            stroke: i < review.stars ? 'none' : 'var(--muted-foreground)',
                          }}
                        />
                      ))}
                    </div>

                    {/* Текст отзыва */}
                    {review.comment && (
                      <div
                        style={{
                          fontSize: '14px',
                          color: 'var(--foreground)',
                          lineHeight: 1.5,
                          marginTop: '2px',
                        }}
                      >
                        {review.comment}
                      </div>
                    )}

                    {/* Теги (если есть) */}
                    {review.tags && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {review.tags.split(',').map((tag, tagIdx) => (
                          <Chip
                            key={tagIdx}
                            style={{
                              height: '28px',
                              minWidth: 'auto',
                              padding: '0 10px',
                              fontSize: '12px',
                              borderRadius: '10px',
                            }}
                          >
                            {tag.trim()}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default UserProfileScreen;
