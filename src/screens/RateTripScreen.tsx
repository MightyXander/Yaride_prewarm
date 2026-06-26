import { useState } from 'react';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import Header from '../components/Header';
import { Icon } from '../components/Icons';
import { hapticSelection, hapticNotify } from '../lib/haptics';
import { createRating, ApiException } from '../lib/api';
import { showToast } from '../lib/toast';
import type { RatingContext } from '../types/navigation';

// Экран 11 SPEC: Оценка после поездки
// Звёзды 1–5, теги настроения, текстовый отзыв (опционально)

const RATING_TAGS = ['Пунктуальный', 'Вежливый', 'Чисто в авто', 'Приятная музыка'];

interface RateTripScreenProps {
  ratingContext?: RatingContext;
  trip?: {
    driver: {
      name: string;
      avatar: string;
      rating: number;
    };
  };
  onSubmit?: () => void;
  onClose?: () => void;
}

const RateTripScreen: React.FC<RateTripScreenProps> = ({ ratingContext, trip, onSubmit, onClose }) => {
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(['Пунктуальный']);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const driverName = trip?.driver.name || 'Андрей К.';
  const driverAvatar = trip?.driver.avatar || 'А';

  const handleStarClick = (stars: number) => {
    setRating(stars);
    hapticSelection();
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    hapticSelection();
  };

  const handleSubmit = async () => {
    if (!ratingContext) {
      showToast('Ошибка: отсутствуют данные о поездке');
      return;
    }

    setLoading(true);
    try {
      await createRating({
        tripId: ratingContext.tripId,
        rateeId: ratingContext.rateeId,
        stars: rating,
        tags: selectedTags.length > 0 ? selectedTags.join(', ') : null,
        comment: comment.trim() || null,
      });
      hapticNotify('success');
      showToast('Оценка отправлена');
      onSubmit?.();
    } catch (err) {
      if (err instanceof ApiException && err.status === 401) {
        showToast('В браузере требуется авторизация через Telegram');
      } else {
        showToast(err instanceof Error ? err.message : 'Ошибка при отправке оценки');
      }
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Header
        title="Поездка завершена"
        rightIcon="i-close"
        onRightClick={() => {
          hapticNotify('warning');
          onClose?.();
        }}
      />

      <div style={{ textAlign: 'center', marginTop: '6px' }}>
        <div style={{ margin: '0 auto', width: 'fit-content' }}>
          <Avatar label={driverAvatar} size={60} hideRating />
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: '17px',
            letterSpacing: '-0.01em',
            marginTop: '10px',
          }}
        >
          Как доехали с {driverName.split(' ')[0]}?
        </div>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            marginTop: '2px',
          }}
        >
          Оценка видна другим попутчикам
        </div>
      </div>

      {/* Звёзды */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '9px',
          color: 'var(--brand)',
          filter: 'drop-shadow(0 8px 20px rgba(255, 221, 45, .35))',
          marginTop: '4px',
        }}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} звёзд`}
            onClick={() => handleStarClick(star)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              color: star <= rating ? 'var(--brand)' : 'var(--muted-foreground)',
              transition: 'color 0.12s ease, transform 0.08s ease',
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.88)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Icon id="i-star" fill style={{ width: '34px', height: '34px' }} />
          </button>
        ))}
      </div>

      {/* Теги настроения */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: '2px',
        }}
      >
        {RATING_TAGS.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            selected={selectedTags.includes(tag)}
            onClick={() => handleTagToggle(tag)}
            style={{ height: '34px' }}
          />
        ))}
      </div>

      {/* Текстовый отзыв (опционально) */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Добавить отзыв (по желанию)…"
        rows={3}
        style={{
          width: '100%',
          minHeight: '64px',
          padding: '12px 14px',
          borderRadius: '15px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: 'var(--font-sans)',
          resize: 'none',
          outline: 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--brand)';
          e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--brand)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          marginTop: 'auto',
          paddingTop: '6px',
        }}
      >
        <Button variant="primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Отправка…' : 'Отправить оценку'}
        </Button>
      </div>
    </div>
  );
};

export default RateTripScreen;
