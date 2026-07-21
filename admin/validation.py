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


class TimeSlot(str, Enum):
    """CHECK trips.time_slot IN ('morning','evening') — src/server/schema.ts."""

    morning = "morning"
    evening = "evening"


class TripStatus(str, Enum):
    """CHECK trips.status IN ('open','cancelled','completed')."""

    open = "open"
    cancelled = "cancelled"
    completed = "completed"


class BookingStatus(str, Enum):
    """CHECK bookings.status IN ('active','cancelled_by_passenger','cancelled_by_driver')."""

    active = "active"
    cancelled_by_passenger = "cancelled_by_passenger"
    cancelled_by_driver = "cancelled_by_driver"


class PointKind(str, Enum):
    """CHECK route_points.kind IN ('stop','locality')."""

    stop = "stop"
    locality = "locality"


class ErrorSource(str, Enum):
    """CHECK error_traces.source IN ('frontend','backend') — issue #470."""

    frontend = "frontend"
    backend = "backend"


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
    # issue #471: поездки / брони / точки маршрута
    "start_point_id": "Точка отправления",
    "end_point_id": "Точка назначения",
    "trip_date": "Дата поездки",
    "departure_time": "Время выезда",
    "time_slot": "Слот",
    "price_rub": "Цена, ₽",
    "seats_total": "Мест всего",
    "comment": "Комментарий",
    "car_model": "Марка авто",
    "car_color": "Цвет авто",
    "plate": "Госномер",
    "status": "Статус",
    "locality": "Населённый пункт",
    "district": "Район",
    "admin_area": "Адм. округ",
    "title": "Название",
    "latitude": "Широта",
    "longitude": "Долгота",
    "kind": "Тип точки",
    "parent_point_id": "Родительская точка",
}

# Поле формы → Enum допустимых значений (для человекочитаемой ошибки).
# Поля с именем "status" различаются по формам — для них значения берутся
# из ctx ошибки pydantic (ветка fallback в format_validation_errors).
FIELD_ENUMS = {
    "sex": Sex,
    "license_status": LicenseStatus,
    "time_slot": TimeSlot,
    "kind": PointKind,
}


def format_validation_errors(exc: ValidationError) -> str:
    """Свернуть pydantic ValidationError в одно русское сообщение для формы."""
    parts = []
    for err in exc.errors():
        field = str(err["loc"][0]) if err["loc"] else "?"
        label = FIELD_LABELS.get(field, field)
        if err["type"] == "enum":
            enum_cls = FIELD_ENUMS.get(field)
            if enum_cls is not None:
                allowed = ", ".join(m.value for m in enum_cls)
            else:
                allowed = str((err.get("ctx") or {}).get("expected", "")).replace("'", "")
            parts.append(f"{label}: допустимые значения — {allowed}")
        elif err["type"] in ("int_parsing", "int_type", "int_from_float"):
            parts.append(f"{label}: введите целое число")
        elif err["type"] in ("float_parsing", "float_type"):
            parts.append(f"{label}: введите число")
        elif err["type"] in ("missing", "string_type"):
            # string_type возникает, когда обязательное текстовое поле пришло
            # пустым (валидатор _blank_to_none превратил "" в None).
            parts.append(f"{label}: обязательное поле")
        else:
            # pydantic префиксует наши ValueError строкой "Value error, "
            msg = err["msg"].removeprefix("Value error, ")
            parts.append(f"{label}: {msg}")
    return "; ".join(parts)


# Сообщения SQLSTATE по «сущностям» (entity) — у каждой таблицы свои уникальные
# индексы и внешние ключи, универсальный текст был бы враньём для формы.
_UNIQUE_MSG = {
    "users": "Логин или email уже заняты другим пользователем.",
    "route_points": "Точка с таким сочетанием «населённый пункт / район / округ / название» уже существует.",
    "bookings": "У этого пассажира уже есть бронь на эту поездку.",
    "default": "Нарушена уникальность: такая запись уже существует.",
}
_CHECK_MSG = {
    "users": "Значение нарушает ограничение БД: проверьте поля «Пол» и «Статус ВУ».",
    "default": "Значение нарушает CHECK-ограничение БД: проверьте поля со списком допустимых значений.",
}
_FK_MSG = {
    "users": "Операция невозможна: на пользователя ссылаются другие записи.",
    "default": "Операция невозможна: запись ссылается на несуществующие данные либо на неё ссылаются другие записи.",
}


def db_error_message(exc: Exception, entity: str = "users") -> str:
    """Маппер SQLSTATE → понятное русское сообщение для формы.

    Используется в обработчиках write-операций: транзакция откатывается,
    админ видит текст ошибки вместо 500 / сырой ошибки БД. entity подбирает
    формулировку под таблицу (users по умолчанию — обратная совместимость #469).
    """
    sqlstate = getattr(exc, "sqlstate", None)
    if sqlstate == "23505":
        return _UNIQUE_MSG.get(entity, _UNIQUE_MSG["default"])
    if sqlstate == "23514":
        return _CHECK_MSG.get(entity, _CHECK_MSG["default"])
    if sqlstate == "22008":
        return "Некорректная дата: проверьте формат YYYY-MM-DD."
    if sqlstate == "23503":
        return _FK_MSG.get(entity, _FK_MSG["default"])
    return f"Ошибка базы данных ({sqlstate or exc.__class__.__name__})."


# --- Формы разделов «Поездки», «Брони», «Точки маршрута» (issue #471) ----------

TRIP_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# departure_time — TEXT 'HH:MM' с ведущими нулями: лексикографическое сравнение
# совпадает с хронологическим (src/server/repo/trips.ts:137-146).
DEPARTURE_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class TripEditForm(BaseModel):
    """Форма редактирования поездки (admin/trips/{id}).

    Сознательно НЕ редактируются: driver_id (смена водителя ломает
    денормализованные trips_driver_count), seats_booked (поддерживается из
    активных броней), id/created_at (системные).
    """

    start_point_id: int
    end_point_id: int
    trip_date: str | None = None
    departure_time: str | None = None
    time_slot: TimeSlot
    price_rub: int
    seats_total: int
    comment: str | None = None
    car_model: str | None = None
    car_color: str | None = None
    plate: str | None = None
    status: TripStatus

    @field_validator("*", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v == "":
                return None
        return v

    @field_validator("trip_date")
    @classmethod
    def _check_trip_date(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if TRIP_DATE_RE.fullmatch(v) is None:
            raise ValueError("формат YYYY-MM-DD")
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError("несуществующая дата")
        return v

    @field_validator("departure_time")
    @classmethod
    def _check_departure_time(cls, v: str | None) -> str | None:
        if v is not None and DEPARTURE_TIME_RE.fullmatch(v) is None:
            raise ValueError("формат HH:MM (24 часа, с ведущими нулями)")
        return v

    @field_validator("price_rub")
    @classmethod
    def _check_price(cls, v: int) -> int:
        if v < 0:
            raise ValueError("не может быть отрицательной")
        return v

    @field_validator("seats_total")
    @classmethod
    def _check_seats(cls, v: int) -> int:
        if v < 1:
            raise ValueError("минимум 1 место")
        return v


class BookingEditForm(BaseModel):
    """Смена статуса брони. Пересчёт trips_passenger_count и trips.seats_booked
    делает обработчик в той же транзакции."""

    status: BookingStatus


class RoutePointForm(BaseModel):
    """Создание/редактирование точки маршрута (admin/route-points)."""

    locality: str
    # str | None: _blank_to_none ('' → None) отрабатывает до проверки типа,
    # затем _none_to_empty (after) возвращает '' — колонки NOT NULL DEFAULT ''.
    district: str | None = ""
    admin_area: str | None = ""
    title: str
    latitude: float | None = None
    longitude: float | None = None
    kind: PointKind = PointKind.stop
    parent_point_id: int | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v == "":
                return None
        return v

    @field_validator("district", "admin_area")
    @classmethod
    def _none_to_empty(cls, v: str | None) -> str:
        # Колонки NOT NULL DEFAULT '' — пустое поле формы означает ''.
        return v if v is not None else ""

    @field_validator("latitude")
    @classmethod
    def _check_latitude(cls, v: float | None) -> float | None:
        if v is not None and not (-90.0 <= v <= 90.0):
            raise ValueError("диапазон от -90 до 90")
        return v

    @field_validator("longitude")
    @classmethod
    def _check_longitude(cls, v: float | None) -> float | None:
        if v is not None and not (-180.0 <= v <= 180.0):
            raise ValueError("диапазон от -180 до 180")
        return v
