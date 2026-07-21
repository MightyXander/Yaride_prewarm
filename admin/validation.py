"""Слой валидации админки (issue #469).

Единая точка правил для админ-форм. Правила ЗЕРКАЛИРУЮТ первоисточник
на TypeScript и не должны от него расходиться:
- EMAIL_RE / USERNAME_RE / normalize_birth_date — src/server/auth.ts:315-316, 356-375;
- validate_series_number / validate_valid_until — src/server/api.ts:1838-1874.

Зависимости: только pydantic (доступен транзитивно через fastapi).
"""

from __future__ import annotations

import calendar
import re
from datetime import date
from enum import Enum

from pydantic import BaseModel, ValidationError, field_validator

# Зеркало src/server/auth.ts:315 (EMAIL_RE)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
# Зеркало src/server/auth.ts:316 (USERNAME_RE)
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]+$")


class Sex(str, Enum):
    """CHECK users.sex IN ('male','female','unknown') — src/server/schema.ts."""

    male = "male"
    female = "female"
    unknown = "unknown"


class LicenseStatus(str, Enum):
    """CHECK users.license_status IN ('none','pending','verified','rejected')."""

    none = "none"
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


def normalize_birth_date(raw: str) -> str | None:
    """Зеркало normalizeBirthDate (src/server/auth.ts:356-375).

    Строгий YYYY-MM-DD, реальная дата, не в будущем, возраст ≤120 лет.
    Возвращает канонический YYYY-MM-DD или None.
    """
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", raw, flags=re.ASCII)
    if m is None:
        return None
    year, month, day = int(m[1]), int(m[2]), int(m[3])
    try:
        dt = date(year, month, day)
    except ValueError:
        return None
    today = date.today()
    if dt > today:
        return None
    try:
        oldest = today.replace(year=today.year - 120)
    except ValueError:
        # 29 февраля в невисокосном году → 1 марта (как Date.UTC в JS-первоисточнике)
        oldest = date(today.year - 120, 3, 1)
    if dt < oldest:
        return None
    return f"{m[1]}-{m[2]}-{m[3]}"


def validate_series_number(raw: str) -> str | None:
    """Зеркало validateSeriesNumber (src/server/api.ts:1838-1847).

    Формат 'NNNN ЛЛ NNNNNN' (4 цифры, 2 РУССКИЕ буквы, 6 цифр).
    Возвращает нормализованную строку или None.
    """
    cleaned = re.sub(r"\s+", " ", raw).strip()
    m = re.fullmatch(r"([0-9]{4}) ([А-ЯЁ]{2}) ([0-9]{6})", cleaned)
    if m is None:
        return None
    return f"{m[1]} {m[2]} {m[3]}"


def validate_valid_until(raw: str) -> str | None:
    """Зеркало validateValidUntil (src/server/api.ts:1853-1874).

    Формат 'MM/YYYY' (пробелы игнорируются), месяц 01-12, срок не истёк
    (последний день месяца >= сегодня). Возвращает 'MM/YYYY' или None.
    """
    cleaned = re.sub(r"\s+", "", raw)
    m = re.fullmatch(r"([0-9]{2})/([0-9]{4})", cleaned)
    if m is None:
        return None
    month, year = int(m[1]), int(m[2])
    if month < 1 or month > 12:
        return None
    last_day = date(year, month, calendar.monthrange(year, month)[1])
    if last_day < date.today():
        return None
    return f"{m[1]}/{m[2]}"


class UserEditForm(BaseModel):
    """Форма редактирования пользователя из админки.

    Все поля опциональны; пустая строка означает «очистить» и приводится к None.
    Денормализованные (trips_*_count, rating_*) и системные (id, tg_user_id,
    password_hash, created_at) поля сюда сознательно НЕ входят.
    """

    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    email: str | None = None
    sex: Sex | None = None
    birth_date: str | None = None
    license_status: LicenseStatus | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v == "":
                return None
        return v

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str | None) -> str | None:
        if v is not None and EMAIL_RE.fullmatch(v) is None:
            raise ValueError("введите корректный email")
        return v

    @field_validator("username")
    @classmethod
    def _check_username(cls, v: str | None) -> str | None:
        if v is not None and USERNAME_RE.fullmatch(v) is None:
            raise ValueError("только латиница, цифры и _")
        return v

    @field_validator("birth_date")
    @classmethod
    def _check_birth_date(cls, v: str | None) -> str | None:
        if v is None:
            return None
        normalized = normalize_birth_date(v)
        if normalized is None:
            raise ValueError(
                "формат YYYY-MM-DD, реальная дата, не в будущем, возраст до 120 лет"
            )
        return normalized


# Человекочитаемые подписи полей для сообщений об ошибках на форме.
FIELD_LABELS = {
    "first_name": "Имя",
    "last_name": "Фамилия",
    "username": "Логин",
    "email": "Email",
    "sex": "Пол",
    "birth_date": "Дата рождения",
    "license_status": "Статус ВУ",
}


def format_validation_errors(exc: ValidationError) -> str:
    """Свернуть pydantic ValidationError в одно русское сообщение для формы."""
    parts = []
    for err in exc.errors():
        field = str(err["loc"][0]) if err["loc"] else "?"
        label = FIELD_LABELS.get(field, field)
        if err["type"] == "enum":
            allowed = ", ".join(
                m.value for m in (Sex if field == "sex" else LicenseStatus)
            )
            parts.append(f"{label}: допустимые значения — {allowed}")
        else:
            # pydantic префиксует наши ValueError строкой "Value error, "
            msg = err["msg"].removeprefix("Value error, ")
            parts.append(f"{label}: {msg}")
    return "; ".join(parts)


def db_error_message(exc: Exception) -> str:
    """Маппер SQLSTATE → понятное русское сообщение для формы.

    Используется в обработчиках write-операций: транзакция откатывается,
    админ видит текст ошибки вместо 500 / сырой ошибки БД.
    """
    sqlstate = getattr(exc, "sqlstate", None)
    if sqlstate == "23505":
        return "Логин или email уже заняты другим пользователем."
    if sqlstate == "23514":
        return "Значение нарушает ограничение БД: проверьте поля «Пол» и «Статус ВУ»."
    if sqlstate == "22008":
        return "Некорректная дата: проверьте формат YYYY-MM-DD."
    if sqlstate == "23503":
        return "Операция невозможна: на пользователя ссылаются другие записи."
    return f"Ошибка базы данных ({sqlstate or exc.__class__.__name__})."
