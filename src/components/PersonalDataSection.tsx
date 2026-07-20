import { useCallback, useEffect, useState } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import GenderSelect, { type GenderValue } from './ui/GenderSelect';
import { AuthField } from './AuthKit';
import { ApiException, getMyPersonal, requestPersonalChange } from '../lib/api';
import { showToast } from '../lib/toast';
import type { PersonalData, PersonalChangeRequest } from '../types/api';

/**
 * PersonalDataSection (issue #456) — раздел «Личные данные» в Профиле.
 * Просмотр 6 полей (Ник, Почта, Имя, Фамилия, Дата рождения, Пол) из
 * GET /api/me/personal + правка через ЗАЯВКУ (POST /api/me/personal/request):
 * поля не меняются сразу, а уходят на одобрение. Пока заявка активна
 * (pendingRequest) — форма и кнопка «Изменить» заблокированы, показывается
 * плашка «на одобрении» с перечнем запрошенных изменений. Пол переехал сюда
 * из прежней отдельной секции профиля и теперь меняется только этим flow.
 */

const FIELD_ORDER = ['username', 'email', 'first_name', 'last_name', 'birth_date', 'sex'] as const;

const FIELD_LABELS: Record<string, string> = {
  username: 'Ник',
  email: 'Почта',
  first_name: 'Имя',
  last_name: 'Фамилия',
  birth_date: 'Дата рождения',
  sex: 'Пол',
};

const SEX_LABELS: Record<string, string> = {
  male: 'Мужской',
  female: 'Женский',
  unknown: 'Не указано',
};

function displayValue(field: string, value: unknown): string {
  if (field === 'sex') return SEX_LABELS[String(value)] ?? 'Не указано';
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'username') return `@${String(value)}`;
  return String(value);
}

const rowLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  fontWeight: 700,
  marginBottom: '2px',
};

const dateInputStyle: React.CSSProperties = {
  width: '100%',
  height: '48px',
  borderRadius: '12px',
  border: '1.5px solid var(--field-border)',
  background: 'var(--field)',
  color: 'var(--foreground)',
  padding: '0 14px',
  fontSize: '15px',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
};

const PersonalDataSection: React.FC = () => {
  const [personal, setPersonal] = useState<PersonalData | null>(null);
  const [pending, setPending] = useState<PersonalChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [fUsername, setFUsername] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fFirstName, setFFirstName] = useState('');
  const [fLastName, setFLastName] = useState('');
  const [fBirthDate, setFBirthDate] = useState('');
  const [fSex, setFSex] = useState<GenderValue>('');

  const load = useCallback(async () => {
    try {
      const res = await getMyPersonal();
      setPersonal(res.personal);
      setPending(res.pendingRequest);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiException ? e.message : 'Не удалось загрузить личные данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (!personal) return;
    setFUsername(personal.username ?? '');
    setFEmail(personal.email ?? '');
    setFFirstName(personal.first_name ?? '');
    setFLastName(personal.last_name ?? '');
    setFBirthDate(personal.birth_date ?? '');
    setFSex(personal.sex === 'unknown' ? '' : personal.sex);
    setFieldErrors({});
    setEditing(true);
  };

  const submit = async () => {
    if (submitting) return;
    setFieldErrors({});
    setSubmitting(true);
    try {
      // Шлём всю форму — бэк сам вычислит дельту (равные текущим поля отбросит).
      await requestPersonalChange({
        username: fUsername.trim(),
        email: fEmail.trim(),
        first_name: fFirstName.trim(),
        last_name: fLastName.trim(),
        birth_date: fBirthDate.trim() === '' ? null : fBirthDate.trim(),
        sex: fSex === '' ? undefined : fSex,
      });
      await load();
      setEditing(false);
      showToast('Изменения отправлены на одобрение');
    } catch (e) {
      if (e instanceof ApiException) {
        const code = e.details?.code as string | undefined;
        const field = e.details?.field as string | undefined;
        if (code === 'empty_delta') {
          showToast('Вы ничего не изменили');
        } else if (field) {
          setFieldErrors({ [field]: e.message });
        } else {
          showToast(e.message);
        }
      } else {
        showToast('Не удалось отправить изменения');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card
      data-testid="personal-section"
      style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      <div style={{ fontSize: '16px', fontWeight: 700 }}>Личные данные</div>

      {loading ? (
        <div style={{ fontSize: '14px', color: 'var(--muted-foreground)' }}>Загрузка…</div>
      ) : loadError ? (
        <div style={{ fontSize: '14px', color: 'var(--danger)' }}>{loadError}</div>
      ) : !personal ? null : editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <AuthField
            label="Ник"
            prefix="@"
            autoComplete="username"
            value={fUsername}
            onChange={(v) => {
              setFUsername(v);
              if (fieldErrors.username) setFieldErrors((p) => ({ ...p, username: '' }));
            }}
            error={fieldErrors.username || undefined}
          />
          <AuthField
            label="Почта"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={fEmail}
            onChange={(v) => {
              setFEmail(v);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
            }}
            error={fieldErrors.email || undefined}
          />
          <AuthField
            label="Имя"
            autoComplete="given-name"
            value={fFirstName}
            onChange={(v) => {
              setFFirstName(v);
              if (fieldErrors.first_name) setFieldErrors((p) => ({ ...p, first_name: '' }));
            }}
            error={fieldErrors.first_name || undefined}
          />
          <AuthField
            label="Фамилия"
            autoComplete="family-name"
            value={fLastName}
            onChange={(v) => {
              setFLastName(v);
              if (fieldErrors.last_name) setFieldErrors((p) => ({ ...p, last_name: '' }));
            }}
            error={fieldErrors.last_name || undefined}
          />
          <div>
            <div style={rowLabelStyle}>Дата рождения</div>
            <input
              type="date"
              className="focus-ring"
              aria-label="Дата рождения"
              value={fBirthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setFBirthDate(e.target.value);
                if (fieldErrors.birth_date) setFieldErrors((p) => ({ ...p, birth_date: '' }));
              }}
              style={dateInputStyle}
            />
            {fieldErrors.birth_date ? (
              <div role="alert" style={{ fontSize: '12.5px', color: 'var(--danger)', fontWeight: 600, marginTop: '6px' }}>
                {fieldErrors.birth_date}
              </div>
            ) : null}
          </div>
          <GenderSelect
            value={fSex}
            onChange={(v) => {
              setFSex(v);
              if (fieldErrors.sex) setFieldErrors((p) => ({ ...p, sex: '' }));
            }}
            label="Пол"
            error={fieldErrors.sex || undefined}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              variant="primary"
              haptic="none"
              disabled={submitting}
              onClick={() => void submit()}
              data-testid="personal-submit-btn"
              style={{ flex: 1 }}
            >
              {submitting ? 'Отправляем…' : 'Отправить на одобрение'}
            </Button>
            <Button
              variant="ghost"
              disabled={submitting}
              onClick={() => setEditing(false)}
              style={{ flex: 1 }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {FIELD_ORDER.map((field) => (
              <div key={field} data-testid={`personal-field-${field}`}>
                <div style={rowLabelStyle}>{FIELD_LABELS[field]}</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>
                  {displayValue(field, personal[field])}
                </div>
              </div>
            ))}
          </div>

          {pending ? (
            <div
              data-testid="personal-pending"
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'var(--secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Изменения отправлены на одобрение</div>
              <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                {Object.keys(pending.payload)
                  .map((k) => `${FIELD_LABELS[k] ?? k}: ${displayValue(k, (pending.payload as Record<string, unknown>)[k])}`)
                  .join(' · ')}
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={startEdit} data-testid="personal-edit-btn">
              Изменить
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};

export default PersonalDataSection;
