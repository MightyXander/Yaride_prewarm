"""Веб-админка Yaride_prewarm.

Тонкий слой над схемой prewarm (БД yaride_prewarm) — без переноса repo.py
основного приложения. Переиспользует UI/стиль Yaride-админки. MVP:
вход, дашборд-счётчики, модерация ВУ (license_requests), список пользователей.

Авторизация: сессия + таблица prewarm.admin_users (pbkdf2_sha256).
Бутстрап первого админа — из env ADMIN_BOOTSTRAP_USER/ADMIN_BOOTSTRAP_PASS.
"""

from __future__ import annotations

import json
import math
import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

import psycopg
from passlib.context import CryptContext
from pydantic import ValidationError
from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

try:  # запуск из каталога admin/ (Docker: uvicorn main:app)
    import validation
except ImportError:  # запуск как пакет: uvicorn admin.main:app
    from admin import validation  # type: ignore[no-redef]

_BASE = Path(__file__).resolve().parent
TEMPLATES = Jinja2Templates(directory=str(_BASE / "templates"))
PWD = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
SCHEMA = os.getenv("DB_SCHEMA", "prewarm").strip() or "prewarm"

# --- Roadmap-гейт: пороги ликвидности (CEO Council, Фаза 1 — один коридор) ---
# Правятся здесь. Значения калиброваны под окно в 7 дней.
GATE_EMPTY_SEARCH_GREEN = 20.0   # доля пустых поисков < 20% → зелёный
GATE_EMPTY_SEARCH_YELLOW = 30.0  # 20–30% → жёлтый, > 30% → красный
GATE_ACTIVE_DRIVERS_GREEN = 12   # активных водителей/нед ≥ 12 → зелёный
GATE_ACTIVE_DRIVERS_YELLOW = 8   # 8–11 → жёлтый, < 8 → красный
GATE_COMPLETED_TRIPS_GREEN = 40  # завершённых поездок/нед ≥ 40 → зелёный
GATE_COMPLETED_TRIPS_YELLOW = 20 # 20–39 → жёлтый, < 20 → красный


def _conn() -> psycopg.Connection:
    url = os.environ["DATABASE_URL"]
    conn = psycopg.connect(url, autocommit=True)
    conn.execute(f"SET search_path TO {SCHEMA}")
    return conn


def _ensure_admin_schema() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMPTZ
            )
            """
        )
        # Бутстрап первого админа из env, если таблица пуста.
        user = os.getenv("ADMIN_BOOTSTRAP_USER", "").strip()
        pwd = os.getenv("ADMIN_BOOTSTRAP_PASS", "").strip()
        if user and pwd:
            row = conn.execute("SELECT COUNT(*) FROM admin_users").fetchone()
            if row and row[0] == 0:
                conn.execute(
                    "INSERT INTO admin_users(username, password_hash) VALUES (%s, %s)"
                    " ON CONFLICT (username) DO NOTHING",
                    (user, PWD.hash(pwd)),
                )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_admin_schema()
    yield


app = FastAPI(title="Yaride Admin (prewarm)", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("ADMIN_SESSION_SECRET", "dev-insecure-change-me"),
    same_site="lax",
)
app.mount("/admin/static", StaticFiles(directory=str(_BASE / "static")), name="static")


def require_login(request: Request) -> str:
    admin = request.session.get("admin")
    if not admin:
        raise HTTPException(status_code=307, headers={"Location": "/admin/login"})
    return admin


@app.exception_handler(HTTPException)
async def _redirect_login(request: Request, exc: HTTPException):
    if exc.status_code == 307 and exc.headers and exc.headers.get("Location"):
        return RedirectResponse(exc.headers["Location"], status_code=307)
    raise exc


def render(request: Request, template: str, **ctx) -> HTMLResponse:
    ctx.setdefault("admin", request.session.get("admin"))
    return TEMPLATES.TemplateResponse(request, template, ctx)


@app.get("/admin/health")
def health():
    try:
        with _conn() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "db": True}
    except Exception as e:  # noqa: BLE001
        return {"status": "ok", "db": False, "error": str(e)}


@app.get("/admin/login", response_class=HTMLResponse)
def login_form(request: Request):
    return render(request, "login.html", admin=None)


@app.post("/admin/login")
def login(request: Request, username: str = Form(...), password: str = Form(...)):
    with _conn() as conn:
        row = conn.execute(
            "SELECT password_hash FROM admin_users WHERE username = %s", (username.strip(),)
        ).fetchone()
    ok = bool(row) and _verify(password, row[0])
    if not ok:
        return render(request, "login.html", admin=None, error="Неверный логин или пароль")
    with _conn() as conn:
        conn.execute(
            "UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE username = %s",
            (username.strip(),),
        )
    request.session["admin"] = username.strip()
    return RedirectResponse("/admin", status_code=303)


def _verify(password: str, password_hash: str) -> bool:
    try:
        return PWD.verify(password, password_hash)
    except ValueError:
        return False


@app.get("/admin/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/admin/login", status_code=303)


@app.get("/admin", response_class=HTMLResponse)
def dashboard(request: Request, admin: str = Depends(require_login)):
    with _conn() as conn:
        users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        trips_open = conn.execute("SELECT COUNT(*) FROM trips WHERE status='open'").fetchone()[0]
        trips_total = conn.execute("SELECT COUNT(*) FROM trips").fetchone()[0]
        bookings = conn.execute("SELECT COUNT(*) FROM bookings WHERE status='active'").fetchone()[0]
        pending = conn.execute(
            "SELECT COUNT(*) FROM license_requests WHERE status='pending'"
        ).fetchone()[0]
        pending_profiles = conn.execute(
            "SELECT COUNT(*) FROM profile_change_requests WHERE status='pending'"
        ).fetchone()[0]
    return render(
        request,
        "dashboard.html",
        active="dashboard",
        stats={
            "users": users,
            "trips_open": trips_open,
            "trips_total": trips_total,
            "bookings": bookings,
            "pending_drivers": pending,
            "pending_profiles": pending_profiles,
        },
    )


@app.get("/admin/drivers/pending", response_class=HTMLResponse)
def drivers_pending(
    request: Request,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT lr.id AS req_id, lr.series_number, lr.valid_until, lr.created_at,
                   u.id AS user_id, u.name, u.username, u.tg_user_id, u.license_status,
                   c.model AS car_model, c.plate AS car_plate
            FROM license_requests lr
            JOIN users u ON u.id = lr.driver_id
            LEFT JOIN cars c ON c.driver_id = u.id
            WHERE lr.status = 'pending'
            ORDER BY lr.created_at ASC
            """
        ).fetchall()
    items = [
        {
            "req_id": r[0], "series_number": r[1], "valid_until": r[2], "created_at": r[3],
            "user_id": r[4], "name": r[5], "username": r[6], "tg_user_id": r[7],
            "license_status": r[8], "car_model": r[9], "car_plate": r[10],
        }
        for r in rows
    ]
    return render(
        request, "drivers_pending.html", active="drivers",
        items=items, pending_count=len(items), error=error, msg=msg,
    )


@app.post("/admin/drivers/{req_id}/approve")
def driver_approve(request: Request, req_id: int, admin: str = Depends(require_login)):
    err = _review_license(req_id, "approved", "verified", admin)
    if err:
        return RedirectResponse(f"/admin/drivers/pending?error={quote(err)}", status_code=303)
    return RedirectResponse("/admin/drivers/pending", status_code=303)


@app.post("/admin/drivers/{req_id}/reject")
def driver_reject(request: Request, req_id: int, admin: str = Depends(require_login)):
    err = _review_license(req_id, "rejected", "rejected", admin)
    if err:
        return RedirectResponse(f"/admin/drivers/pending?error={quote(err)}", status_code=303)
    return RedirectResponse("/admin/drivers/pending", status_code=303)


def _review_license(req_id: int, req_status: str, user_status: str, reviewer: str) -> str | None:
    """Решение по заявке ВУ. Возвращает текст ошибки для формы или None.

    Approve предварительно валидирует серию/номер и срок действия ВУ
    (validation.py — зеркало src/server/api.ts:1838-1874); невалидная
    заявка остаётся pending. Оба UPDATE выполняются в одной транзакции
    (issue #469: раньше autocommit без транзакции).
    """
    with _conn() as conn:
        row = conn.execute(
            "SELECT driver_id, series_number, valid_until FROM license_requests"
            " WHERE id = %s AND status = 'pending'",
            (req_id,),
        ).fetchone()
        if not row:
            return None
        driver_id, series_number, valid_until = row
        if req_status == "approved":
            if validation.validate_series_number(series_number or "") is None:
                return (
                    f"Заявка #{req_id} осталась в ожидании: серия/номер ВУ"
                    " не в формате «NNNN ЛЛ NNNNNN» (4 цифры, 2 русские буквы, 6 цифр)."
                )
            if validation.validate_valid_until(valid_until or "") is None:
                return (
                    f"Заявка #{req_id} осталась в ожидании: срок действия ВУ"
                    " не в формате MM/YYYY или уже истёк."
                )
        try:
            with conn.transaction():
                conn.execute(
                    "UPDATE license_requests SET status=%s, reviewed_at=CURRENT_TIMESTAMP, reviewer=%s"
                    " WHERE id=%s",
                    (req_status, reviewer, req_id),
                )
                conn.execute("UPDATE users SET license_status=%s WHERE id=%s", (user_status, driver_id))
        except psycopg.Error as exc:
            return validation.db_error_message(exc)
    return None


# --- Запросы на изменения данных профиля (issue #457) --------------------------
# Поля личных данных, которые пользователь может запросить к изменению; порядок
# определяет отображение в карточке заявки.
_PROFILE_FIELDS = ("username", "email", "first_name", "last_name", "birth_date", "sex")
_PROFILE_FIELD_LABELS = {
    "username": "Логин",
    "email": "Email",
    "first_name": "Имя",
    "last_name": "Фамилия",
    "birth_date": "Дата рождения",
    "sex": "Пол",
}
_SEX_LABELS = {"male": "Мужской", "female": "Женский", "unknown": "Не указан"}


def _fmt_profile_value(field: str, value) -> str:
    if value is None or value == "":
        return "—"
    if field == "sex":
        return _SEX_LABELS.get(value, str(value))
    return str(value)


@app.get("/admin/profile-requests", response_class=HTMLResponse)
def profile_requests(
    request: Request,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT pcr.id, pcr.user_id, pcr.payload, pcr.created_at,
                   u.username, u.email, u.first_name, u.last_name, u.birth_date, u.sex
            FROM profile_change_requests pcr
            JOIN users u ON u.id = pcr.user_id
            WHERE pcr.status = 'pending'
            ORDER BY pcr.created_at ASC
            """
        ).fetchall()
    items = []
    for r in rows:
        (req_id, user_id, payload, created_at,
         username, email, first_name, last_name, birth_date, sex) = r
        current = {
            "username": username, "email": email,
            "first_name": first_name, "last_name": last_name,
            "birth_date": birth_date, "sex": sex,
        }
        payload = payload if isinstance(payload, dict) else {}
        changes = [
            {
                "label": _PROFILE_FIELD_LABELS[f],
                "current": _fmt_profile_value(f, current.get(f)),
                "requested": _fmt_profile_value(f, payload[f]),
            }
            for f in _PROFILE_FIELDS
            if f in payload
        ]
        items.append({
            "req_id": req_id, "user_id": user_id,
            "username": username, "email": email,
            "first_name": first_name, "last_name": last_name,
            "created_at": created_at, "changes": changes,
        })
    return render(
        request, "profile_requests.html", active="profile_requests",
        items=items, pending_count=len(items), error=error, msg=msg,
    )


@app.post("/admin/profile-requests/{req_id}/approve")
def profile_request_approve(request: Request, req_id: int, admin: str = Depends(require_login)):
    err = _apply_profile_request(req_id, admin)
    if err:
        return RedirectResponse(f"/admin/profile-requests?error={quote(err)}", status_code=303)
    return RedirectResponse("/admin/profile-requests", status_code=303)


@app.post("/admin/profile-requests/{req_id}/reject")
def profile_request_reject(
    request: Request,
    req_id: int,
    reason: str = Form(""),
    admin: str = Depends(require_login),
):
    _reject_profile_request(req_id, admin, reason)
    return RedirectResponse("/admin/profile-requests", status_code=303)


def _apply_profile_request(req_id: int, reviewer: str) -> str | None:
    """Применить одобренную заявку к users в одной транзакции.

    UPDATE только присутствующих в payload полей. При нарушении UNIQUE
    (username/email занят) — откат и возврат текста ошибки; users не меняется.
    """
    with _conn() as conn:
        row = conn.execute(
            "SELECT user_id, payload FROM profile_change_requests"
            " WHERE id = %s AND status = 'pending'",
            (req_id,),
        ).fetchone()
        if not row:
            return None
        user_id, payload = row
        payload = payload if isinstance(payload, dict) else {}
        sets, vals = [], []
        for f in _PROFILE_FIELDS:
            if f in payload:
                sets.append(f"{f} = %s")
                vals.append(payload[f])
        try:
            with conn.transaction():
                if sets:
                    conn.execute(
                        f"UPDATE users SET {', '.join(sets)} WHERE id = %s",
                        (*vals, user_id),
                    )
                conn.execute(
                    "UPDATE profile_change_requests SET status='approved',"
                    " reviewed_at=now(), reviewer=%s, reject_reason=NULL WHERE id=%s",
                    (reviewer, req_id),
                )
        except psycopg.errors.UniqueViolation:
            return "Не удалось одобрить: логин или email уже заняты другим пользователем."
    return None


def _reject_profile_request(req_id: int, reviewer: str, reason: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE profile_change_requests SET status='rejected',"
            " reviewed_at=now(), reviewer=%s, reject_reason=%s"
            " WHERE id=%s AND status='pending'",
            (reviewer, reason or None, req_id),
        )


@app.get("/admin/users", response_class=HTMLResponse)
def users_list(
    request: Request,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT id, name, username, tg_user_id, license_status,
                   rating_avg, rating_count, trips_driver_count, trips_passenger_count
            FROM users ORDER BY id ASC
            """
        ).fetchall()
    users = [
        {
            "id": r[0], "name": r[1], "username": r[2], "tg_user_id": r[3],
            "license_status": r[4], "rating_avg": r[5], "rating_count": r[6],
            "trips_driver_count": r[7], "trips_passenger_count": r[8],
        }
        for r in rows
    ]
    return render(request, "users_list.html", active="users", users=users, error=error, msg=msg)


# --- Карточка пользователя: CRUD + валидация (issue #469) ----------------------
# Редактируемые поля формы. Денормализованные (trips_*_count, rating_*) и
# системные (id, tg_user_id, password_hash, created_at) — только чтение.
_USER_EDIT_FIELDS = ("first_name", "last_name", "username", "email", "sex", "birth_date", "license_status")


def _fetch_user(conn: psycopg.Connection, user_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT id, tg_user_id, name, username, email, first_name, last_name,
               birth_date, sex, license_status, created_at,
               rating_avg, rating_count, trips_driver_count, trips_passenger_count,
               password_hash IS NOT NULL AS has_password
        FROM users WHERE id = %s
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0], "tg_user_id": row[1], "name": row[2], "username": row[3],
        "email": row[4], "first_name": row[5], "last_name": row[6],
        "birth_date": row[7].isoformat() if row[7] else None,
        "sex": row[8], "license_status": row[9], "created_at": row[10],
        "rating_avg": row[11], "rating_count": row[12],
        "trips_driver_count": row[13], "trips_passenger_count": row[14],
        "has_password": row[15],
    }


def _render_user_edit(
    request: Request,
    user: dict,
    values: dict,
    *,
    error: str | None = None,
    msg: str | None = None,
    status_code: int = 200,
):
    resp = render(
        request, "user_edit.html", active="users",
        user=user, values=values, error=error, msg=msg,
        sex_options=[s.value for s in validation.Sex],
        license_options=[s.value for s in validation.LicenseStatus],
    )
    resp.status_code = status_code
    return resp


@app.get("/admin/users/{user_id}", response_class=HTMLResponse)
def user_edit_form(
    request: Request,
    user_id: int,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        user = _fetch_user(conn, user_id)
    if user is None:
        return RedirectResponse(
            "/admin/users?error=" + quote("Пользователь не найден."), status_code=303
        )
    values = {f: user[f] for f in _USER_EDIT_FIELDS}
    return _render_user_edit(request, user, values, error=error, msg=msg)


@app.post("/admin/users/{user_id}", response_class=HTMLResponse)
def user_edit_save(
    request: Request,
    user_id: int,
    first_name: str = Form(""),
    last_name: str = Form(""),
    username: str = Form(""),
    email: str = Form(""),
    sex: str = Form(""),
    birth_date: str = Form(""),
    license_status: str = Form(""),
    admin: str = Depends(require_login),
):
    """Сохранение карточки пользователя.

    Валидация — validation.UserEditForm; UPDATE только изменённых полей в одной
    транзакции. Любая ошибка (валидация, занятость email/username, SQLSTATE)
    рендерит форму с русским сообщением и статусом 422 — никаких 500.
    """
    submitted = {
        "first_name": first_name, "last_name": last_name, "username": username,
        "email": email, "sex": sex, "birth_date": birth_date,
        "license_status": license_status,
    }
    with _conn() as conn:
        user = _fetch_user(conn, user_id)
        if user is None:
            return RedirectResponse(
                "/admin/users?error=" + quote("Пользователь не найден."), status_code=303
            )
        try:
            form = validation.UserEditForm(**submitted)
        except ValidationError as exc:
            return _render_user_edit(
                request, user, submitted,
                error=validation.format_validation_errors(exc), status_code=422,
            )
        new_values = {
            "first_name": form.first_name,
            "last_name": form.last_name,
            "username": form.username,
            "email": form.email,
            "sex": form.sex.value if form.sex else None,
            "birth_date": form.birth_date,
            "license_status": form.license_status.value if form.license_status else None,
        }
        changed: dict[str, object] = {}
        for f in ("first_name", "last_name", "username", "email", "birth_date"):
            if new_values[f] != user[f]:
                changed[f] = new_values[f]
        # sex/license_status в БД NOT NULL: пустое значение формы = «не менять».
        for f in ("sex", "license_status"):
            if new_values[f] is not None and new_values[f] != user[f]:
                changed[f] = new_values[f]
        if not changed:
            return _render_user_edit(request, user, submitted, msg="Изменений нет.")
        # Предварительная проверка занятости (уникальные индексы по lower()).
        if changed.get("email") is not None:
            row = conn.execute(
                "SELECT id FROM users WHERE lower(email) = lower(%s) AND id <> %s",
                (changed["email"], user_id),
            ).fetchone()
            if row:
                return _render_user_edit(
                    request, user, submitted,
                    error=f"Email уже занят пользователем #{row[0]}.", status_code=422,
                )
        # Уникальность username — только среди веб-аккаунтов (частичный индекс
        # uq_users_username_lower WHERE password_hash IS NOT NULL).
        if changed.get("username") is not None and user["has_password"]:
            row = conn.execute(
                "SELECT id FROM users WHERE lower(username) = lower(%s) AND id <> %s"
                " AND password_hash IS NOT NULL",
                (changed["username"], user_id),
            ).fetchone()
            if row:
                return _render_user_edit(
                    request, user, submitted,
                    error=f"Логин уже занят пользователем #{row[0]}.", status_code=422,
                )
        sets, vals = [], []
        for f, v in changed.items():
            sets.append(f"{f} = %s")
            vals.append(date.fromisoformat(v) if f == "birth_date" and v is not None else v)
        try:
            with conn.transaction():
                conn.execute(
                    f"UPDATE users SET {', '.join(sets)} WHERE id = %s",
                    (*vals, user_id),
                )
        except psycopg.Error as exc:
            return _render_user_edit(
                request, user, submitted,
                error=validation.db_error_message(exc), status_code=422,
            )
    return RedirectResponse(
        f"/admin/users/{user_id}?msg=" + quote("Изменения сохранены."), status_code=303
    )


@app.post("/admin/users/{user_id}/delete")
def user_delete(request: Request, user_id: int, admin: str = Depends(require_login)):
    """Удаление пользователя — только без связанной истории.

    FK trips.driver_id / bookings.passenger_id / license_requests.driver_id
    без ON DELETE: удаление с историей сломало бы целостность, поэтому guard
    перечисляет причины отказа.
    """
    with _conn() as conn:
        counts = conn.execute(
            """
            SELECT (SELECT count(*) FROM trips WHERE driver_id = %(id)s),
                   (SELECT count(*) FROM bookings WHERE passenger_id = %(id)s),
                   (SELECT count(*) FROM license_requests WHERE driver_id = %(id)s)
            """,
            {"id": user_id},
        ).fetchone()
        trips_n, bookings_n, lic_n = counts
        reasons = []
        if trips_n:
            reasons.append(f"поездки как водитель: {trips_n}")
        if bookings_n:
            reasons.append(f"бронирования как пассажир: {bookings_n}")
        if lic_n:
            reasons.append(f"заявки на ВУ: {lic_n}")
        if reasons:
            err = "Удаление запрещено — есть связанные записи (" + "; ".join(reasons) + ")."
            return RedirectResponse(
                f"/admin/users/{user_id}?error=" + quote(err), status_code=303
            )
        try:
            with conn.transaction():
                conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
        except psycopg.Error as exc:
            return RedirectResponse(
                f"/admin/users/{user_id}?error=" + quote(validation.db_error_message(exc)),
                status_code=303,
            )
    return RedirectResponse(
        "/admin/users?msg=" + quote(f"Пользователь #{user_id} удалён."), status_code=303
    )


# --- Поездки, брони, точки маршрута, ошибки (issue #471) -----------------------

_PAGE_SIZE = 50


def _recount_user_trip_counters(conn: psycopg.Connection, user_ids: list[int]) -> None:
    """Пересчёт денормализованных счётчиков поездок из источников.

    Зеркало recountUserTripCounters (src/server/repo/_shared.ts:39-58):
    trips_driver_count — неотменённые поездки водителя; trips_passenger_count —
    активные брони пассажира. Вызывается ВНУТРИ транзакции после мутаций.
    """
    if not user_ids:
        return
    conn.execute(
        """
        UPDATE users u SET
          trips_driver_count = (
            SELECT COUNT(*) FROM trips t
            WHERE t.driver_id = u.id AND t.status <> 'cancelled'
          ),
          trips_passenger_count = (
            SELECT COUNT(*) FROM bookings b
            WHERE b.passenger_id = u.id AND b.status = 'active'
          )
        WHERE u.id = ANY(%s)
        """,
        (user_ids,),
    )


def _recount_trip_seats(conn: psycopg.Connection, trip_id: int) -> None:
    """Пересчёт trips.seats_booked из активных броней (денормализация)."""
    conn.execute(
        """
        UPDATE trips SET seats_booked = (
          SELECT COALESCE(SUM(seats), 0) FROM bookings
          WHERE trip_id = %s AND status = 'active'
        )
        WHERE id = %s
        """,
        (trip_id, trip_id),
    )


def _point_options(conn: psycopg.Connection) -> list[dict]:
    """Точки маршрута для <select> в формах поездок/точек."""
    rows = conn.execute(
        """
        SELECT id, title, locality, district, kind
        FROM route_points ORDER BY locality, district, kind DESC, title
        """
    ).fetchall()
    return [
        {"id": r[0], "title": r[1], "locality": r[2], "district": r[3], "kind": r[4]}
        for r in rows
    ]


def _pages(total: int) -> int:
    return max(1, math.ceil(total / _PAGE_SIZE))


# --- Поездки --------------------------------------------------------------------

_TRIP_EDIT_FIELDS = (
    "start_point_id", "end_point_id", "trip_date", "departure_time", "time_slot",
    "price_rub", "seats_total", "comment", "car_model", "car_color", "plate", "status",
)


@app.get("/admin/trips", response_class=HTMLResponse)
def trips_list(
    request: Request,
    status: str = "",
    days: int = 0,
    page: int = 1,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    page = max(page, 1)
    where, params = [], []
    if status not in {s.value for s in validation.TripStatus}:
        status = ""
    if status:
        where.append("t.status = %s")
        params.append(status)
    if days > 0:
        # trip_date — TEXT 'YYYY-MM-DD': лексикографическое сравнение = хронологическое.
        where.append("t.trip_date >= %s")
        params.append((date.today() - timedelta(days=days)).isoformat())
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    with _conn() as conn:
        total = conn.execute(
            f"SELECT count(*) FROM trips t {where_sql}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT t.id, t.trip_date, t.departure_time, t.time_slot, t.status,
                   t.price_rub, t.seats_total, t.seats_booked,
                   t.driver_id, u.name, sp.title, ep.title,
                   (SELECT count(*) FROM bookings b WHERE b.trip_id = t.id)
            FROM trips t
            JOIN users u ON u.id = t.driver_id
            JOIN route_points sp ON sp.id = t.start_point_id
            JOIN route_points ep ON ep.id = t.end_point_id
            {where_sql}
            ORDER BY t.id DESC
            LIMIT %s OFFSET %s
            """,
            (*params, _PAGE_SIZE, (page - 1) * _PAGE_SIZE),
        ).fetchall()
    trips = [
        {
            "id": r[0], "trip_date": r[1], "departure_time": r[2], "time_slot": r[3],
            "status": r[4], "price_rub": r[5], "seats_total": r[6], "seats_booked": r[7],
            "driver_id": r[8], "driver_name": r[9], "start_title": r[10],
            "end_title": r[11], "bookings_n": r[12],
        }
        for r in rows
    ]
    return render(
        request, "trips_list.html", active="trips",
        trips=trips, total=total, page=page, pages=_pages(total),
        status=status, days=days,
        status_options=[s.value for s in validation.TripStatus],
        error=error, msg=msg,
    )


def _fetch_trip(conn: psycopg.Connection, trip_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT t.id, t.driver_id, u.name, t.start_point_id, t.end_point_id,
               t.trip_date, t.departure_time, t.time_slot, t.price_rub,
               t.seats_total, t.seats_booked, t.comment, t.car_model,
               t.car_color, t.plate, t.status, t.created_at,
               (SELECT count(*) FROM bookings b WHERE b.trip_id = t.id),
               (SELECT count(*) FROM ratings r WHERE r.trip_id = t.id)
        FROM trips t JOIN users u ON u.id = t.driver_id
        WHERE t.id = %s
        """,
        (trip_id,),
    ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0], "driver_id": row[1], "driver_name": row[2],
        "start_point_id": row[3], "end_point_id": row[4], "trip_date": row[5],
        "departure_time": row[6], "time_slot": row[7], "price_rub": row[8],
        "seats_total": row[9], "seats_booked": row[10], "comment": row[11],
        "car_model": row[12], "car_color": row[13], "plate": row[14],
        "status": row[15], "created_at": row[16], "bookings_n": row[17],
        "ratings_n": row[18],
    }


def _render_trip_edit(
    request: Request,
    trip: dict,
    values: dict,
    points: list[dict],
    *,
    error: str | None = None,
    msg: str | None = None,
    status_code: int = 200,
):
    resp = render(
        request, "trip_edit.html", active="trips",
        trip=trip, values=values, points=points, error=error, msg=msg,
        slot_options=[s.value for s in validation.TimeSlot],
        status_options=[s.value for s in validation.TripStatus],
    )
    resp.status_code = status_code
    return resp


@app.get("/admin/trips/{trip_id}", response_class=HTMLResponse)
def trip_edit_form(
    request: Request,
    trip_id: int,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        trip = _fetch_trip(conn, trip_id)
        if trip is None:
            return RedirectResponse(
                "/admin/trips?error=" + quote("Поездка не найдена."), status_code=303
            )
        points = _point_options(conn)
    values = {f: trip[f] for f in _TRIP_EDIT_FIELDS}
    return _render_trip_edit(request, trip, values, points, error=error, msg=msg)


@app.post("/admin/trips/{trip_id}", response_class=HTMLResponse)
def trip_edit_save(
    request: Request,
    trip_id: int,
    start_point_id: str = Form(""),
    end_point_id: str = Form(""),
    trip_date: str = Form(""),
    departure_time: str = Form(""),
    time_slot: str = Form(""),
    price_rub: str = Form(""),
    seats_total: str = Form(""),
    comment: str = Form(""),
    car_model: str = Form(""),
    car_color: str = Form(""),
    plate: str = Form(""),
    status: str = Form(""),
    admin: str = Depends(require_login),
):
    """Сохранение поездки: validation.TripEditForm + UPDATE изменённых полей
    в одной транзакции; при смене статуса — пересчёт счётчиков водителя
    (trips_driver_count учитывает только неотменённые поездки)."""
    submitted = {
        "start_point_id": start_point_id, "end_point_id": end_point_id,
        "trip_date": trip_date, "departure_time": departure_time,
        "time_slot": time_slot, "price_rub": price_rub, "seats_total": seats_total,
        "comment": comment, "car_model": car_model, "car_color": car_color,
        "plate": plate, "status": status,
    }
    with _conn() as conn:
        trip = _fetch_trip(conn, trip_id)
        if trip is None:
            return RedirectResponse(
                "/admin/trips?error=" + quote("Поездка не найдена."), status_code=303
            )
        points = _point_options(conn)
        try:
            form = validation.TripEditForm(**submitted)
        except ValidationError as exc:
            return _render_trip_edit(
                request, trip, submitted, points,
                error=validation.format_validation_errors(exc), status_code=422,
            )
        if form.seats_total < trip["seats_booked"]:
            return _render_trip_edit(
                request, trip, submitted, points,
                error=f"Мест всего не может быть меньше уже забронированных ({trip['seats_booked']}).",
                status_code=422,
            )
        new_values = {
            "start_point_id": form.start_point_id,
            "end_point_id": form.end_point_id,
            # Колонки TEXT NOT NULL DEFAULT '': пустое поле формы = ''.
            "trip_date": form.trip_date or "",
            "departure_time": form.departure_time or "",
            "time_slot": form.time_slot.value,
            "price_rub": form.price_rub,
            "seats_total": form.seats_total,
            "comment": form.comment,
            "car_model": form.car_model,
            "car_color": form.car_color,
            "plate": form.plate,
            "status": form.status.value,
        }
        changed = {f: v for f, v in new_values.items() if v != trip[f]}
        if not changed:
            return _render_trip_edit(request, trip, submitted, points, msg="Изменений нет.")
        # FK-проверка изменённых точек отдельным SELECT до UPDATE (issue #471).
        for f in ("start_point_id", "end_point_id"):
            if f in changed:
                row = conn.execute(
                    "SELECT 1 FROM route_points WHERE id = %s", (changed[f],)
                ).fetchone()
                if row is None:
                    return _render_trip_edit(
                        request, trip, submitted, points,
                        error=f"Точка #{changed[f]} не существует.", status_code=422,
                    )
        sets = [f"{f} = %s" for f in changed]
        try:
            with conn.transaction():
                conn.execute(
                    f"UPDATE trips SET {', '.join(sets)} WHERE id = %s",
                    (*changed.values(), trip_id),
                )
                if "status" in changed:
                    _recount_user_trip_counters(conn, [trip["driver_id"]])
        except psycopg.Error as exc:
            return _render_trip_edit(
                request, trip, submitted, points,
                error=validation.db_error_message(exc, "trips"), status_code=422,
            )
    return RedirectResponse(
        f"/admin/trips/{trip_id}?msg=" + quote("Изменения сохранены."), status_code=303
    )


@app.post("/admin/trips/{trip_id}/delete")
def trip_delete(request: Request, trip_id: int, admin: str = Depends(require_login)):
    """Удаление поездки — только без броней (решение issue #471); FK ratings
    тоже проверяем заранее, чтобы отказ был с причиной, а не ошибкой БД."""
    with _conn() as conn:
        trip = _fetch_trip(conn, trip_id)
        if trip is None:
            return RedirectResponse(
                "/admin/trips?error=" + quote("Поездка не найдена."), status_code=303
            )
        reasons = []
        if trip["bookings_n"]:
            reasons.append(f"брони: {trip['bookings_n']}")
        if trip["ratings_n"]:
            reasons.append(f"оценки: {trip['ratings_n']}")
        if reasons:
            err = "Удаление запрещено — есть связанные записи (" + "; ".join(reasons) + ")."
            return RedirectResponse(
                f"/admin/trips/{trip_id}?error=" + quote(err), status_code=303
            )
        try:
            with conn.transaction():
                conn.execute("DELETE FROM trips WHERE id = %s", (trip_id,))
                # Денормализованный trips_driver_count водителя — в той же транзакции.
                _recount_user_trip_counters(conn, [trip["driver_id"]])
        except psycopg.Error as exc:
            return RedirectResponse(
                f"/admin/trips/{trip_id}?error="
                + quote(validation.db_error_message(exc, "trips")),
                status_code=303,
            )
    return RedirectResponse(
        "/admin/trips?msg=" + quote(f"Поездка #{trip_id} удалена."), status_code=303
    )


# --- Брони ----------------------------------------------------------------------

@app.get("/admin/bookings", response_class=HTMLResponse)
def bookings_list(
    request: Request,
    status: str = "",
    page: int = 1,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    page = max(page, 1)
    where, params = [], []
    if status not in {s.value for s in validation.BookingStatus}:
        status = ""
    if status:
        where.append("b.status = %s")
        params.append(status)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    with _conn() as conn:
        total = conn.execute(
            f"SELECT count(*) FROM bookings b {where_sql}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT b.id, b.trip_id, b.passenger_id, u.name, b.seats, b.status,
                   b.cancel_reason, b.created_at, b.cancelled_at,
                   t.trip_date, t.departure_time, sp.title, ep.title
            FROM bookings b
            JOIN users u ON u.id = b.passenger_id
            JOIN trips t ON t.id = b.trip_id
            JOIN route_points sp ON sp.id = t.start_point_id
            JOIN route_points ep ON ep.id = t.end_point_id
            {where_sql}
            ORDER BY b.id DESC
            LIMIT %s OFFSET %s
            """,
            (*params, _PAGE_SIZE, (page - 1) * _PAGE_SIZE),
        ).fetchall()
    bookings = [
        {
            "id": r[0], "trip_id": r[1], "passenger_id": r[2], "passenger_name": r[3],
            "seats": r[4], "status": r[5], "cancel_reason": r[6], "created_at": r[7],
            "cancelled_at": r[8], "trip_date": r[9], "departure_time": r[10],
            "start_title": r[11], "end_title": r[12],
        }
        for r in rows
    ]
    return render(
        request, "bookings_list.html", active="bookings",
        bookings=bookings, total=total, page=page, pages=_pages(total),
        status=status, status_options=[s.value for s in validation.BookingStatus],
        error=error, msg=msg,
    )


@app.post("/admin/bookings/{booking_id}/status")
def booking_set_status(
    request: Request,
    booking_id: int,
    status: str = Form(""),
    admin: str = Depends(require_login),
):
    """Смена статуса брони + пересчёт trips_passenger_count пассажира и
    trips.seats_booked поездки в той же транзакции (оба денормализованы)."""
    try:
        form = validation.BookingEditForm(status=status)
    except ValidationError as exc:
        return RedirectResponse(
            "/admin/bookings?error=" + quote(validation.format_validation_errors(exc)),
            status_code=303,
        )
    with _conn() as conn:
        row = conn.execute(
            "SELECT trip_id, passenger_id, status FROM bookings WHERE id = %s",
            (booking_id,),
        ).fetchone()
        if row is None:
            return RedirectResponse(
                "/admin/bookings?error=" + quote("Бронь не найдена."), status_code=303
            )
        trip_id, passenger_id, old_status = row
        if form.status.value == old_status:
            return RedirectResponse(
                "/admin/bookings?msg=" + quote("Изменений нет."), status_code=303
            )
        try:
            with conn.transaction():
                if form.status is validation.BookingStatus.active:
                    conn.execute(
                        """
                        UPDATE bookings
                        SET status = %s, cancelled_at = NULL, cancel_reason = NULL
                        WHERE id = %s
                        """,
                        (form.status.value, booking_id),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE bookings
                        SET status = %s, cancelled_at = COALESCE(cancelled_at, now())
                        WHERE id = %s
                        """,
                        (form.status.value, booking_id),
                    )
                _recount_trip_seats(conn, trip_id)
                _recount_user_trip_counters(conn, [passenger_id])
        except psycopg.Error as exc:
            return RedirectResponse(
                "/admin/bookings?error="
                + quote(validation.db_error_message(exc, "bookings")),
                status_code=303,
            )
    return RedirectResponse(
        "/admin/bookings?msg=" + quote(f"Статус брони #{booking_id} обновлён."),
        status_code=303,
    )


@app.post("/admin/bookings/{booking_id}/delete")
def booking_delete(request: Request, booking_id: int, admin: str = Depends(require_login)):
    """Удаление брони + пересчёт денормализованных счётчиков в той же транзакции."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT trip_id, passenger_id FROM bookings WHERE id = %s", (booking_id,)
        ).fetchone()
        if row is None:
            return RedirectResponse(
                "/admin/bookings?error=" + quote("Бронь не найдена."), status_code=303
            )
        trip_id, passenger_id = row
        try:
            with conn.transaction():
                conn.execute("DELETE FROM bookings WHERE id = %s", (booking_id,))
                _recount_trip_seats(conn, trip_id)
                _recount_user_trip_counters(conn, [passenger_id])
        except psycopg.Error as exc:
            return RedirectResponse(
                "/admin/bookings?error="
                + quote(validation.db_error_message(exc, "bookings")),
                status_code=303,
            )
    return RedirectResponse(
        "/admin/bookings?msg=" + quote(f"Бронь #{booking_id} удалена."), status_code=303
    )


# --- Точки маршрута ---------------------------------------------------------------

_POINT_EDIT_FIELDS = (
    "locality", "district", "admin_area", "title", "latitude", "longitude",
    "kind", "parent_point_id",
)


@app.get("/admin/route-points", response_class=HTMLResponse)
def route_points_list(
    request: Request,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT p.id, p.locality, p.district, p.admin_area, p.title,
                   p.latitude, p.longitude, p.kind, p.parent_point_id, par.title,
                   (SELECT count(*) FROM trips t
                    WHERE t.start_point_id = p.id OR t.end_point_id = p.id),
                   (SELECT count(*) FROM route_points c WHERE c.parent_point_id = p.id)
            FROM route_points p
            LEFT JOIN route_points par ON par.id = p.parent_point_id
            ORDER BY p.locality, p.district, p.kind DESC, p.id
            """
        ).fetchall()
    points = [
        {
            "id": r[0], "locality": r[1], "district": r[2], "admin_area": r[3],
            "title": r[4], "latitude": r[5], "longitude": r[6], "kind": r[7],
            "parent_point_id": r[8], "parent_title": r[9],
            "trips_n": r[10], "children_n": r[11],
        }
        for r in rows
    ]
    return render(
        request, "route_points.html", active="route_points",
        points=points, error=error, msg=msg,
    )


def _fetch_point(conn: psycopg.Connection, point_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT p.id, p.locality, p.district, p.admin_area, p.title,
               p.latitude, p.longitude, p.kind, p.parent_point_id,
               (SELECT count(*) FROM trips t
                WHERE t.start_point_id = p.id OR t.end_point_id = p.id),
               (SELECT count(*) FROM route_points c WHERE c.parent_point_id = p.id)
        FROM route_points p WHERE p.id = %s
        """,
        (point_id,),
    ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0], "locality": row[1], "district": row[2], "admin_area": row[3],
        "title": row[4], "latitude": row[5], "longitude": row[6], "kind": row[7],
        "parent_point_id": row[8], "trips_n": row[9], "children_n": row[10],
    }


def _render_point_edit(
    request: Request,
    point: dict | None,
    values: dict,
    parents: list[dict],
    *,
    error: str | None = None,
    msg: str | None = None,
    status_code: int = 200,
):
    resp = render(
        request, "route_point_edit.html", active="route_points",
        point=point, values=values, parents=parents, error=error, msg=msg,
        kind_options=[k.value for k in validation.PointKind],
    )
    resp.status_code = status_code
    return resp


def _validate_point_form(
    conn: psycopg.Connection, submitted: dict, point_id: int | None
) -> tuple[validation.RoutePointForm | None, str | None]:
    """Форма + FK-проверка parent_point_id отдельным SELECT (issue #471).
    Возвращает (form, None) или (None, текст ошибки)."""
    try:
        form = validation.RoutePointForm(**submitted)
    except ValidationError as exc:
        return None, validation.format_validation_errors(exc)
    if form.parent_point_id is not None:
        if point_id is not None and form.parent_point_id == point_id:
            return None, "Точка не может быть родителем самой себя."
        row = conn.execute(
            "SELECT 1 FROM route_points WHERE id = %s", (form.parent_point_id,)
        ).fetchone()
        if row is None:
            return None, f"Родительская точка #{form.parent_point_id} не существует."
    return form, None


# ВАЖНО: маршрут /new объявлен раньше /{point_id}, иначе «new» уйдёт в int-парсер.
@app.get("/admin/route-points/new", response_class=HTMLResponse)
def route_point_new_form(
    request: Request,
    error: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        parents = _point_options(conn)
    values = {f: None for f in _POINT_EDIT_FIELDS}
    values["kind"] = validation.PointKind.stop.value
    return _render_point_edit(request, None, values, parents, error=error)


@app.post("/admin/route-points/new", response_class=HTMLResponse)
def route_point_create(
    request: Request,
    locality: str = Form(""),
    district: str = Form(""),
    admin_area: str = Form(""),
    title: str = Form(""),
    latitude: str = Form(""),
    longitude: str = Form(""),
    kind: str = Form(""),
    parent_point_id: str = Form(""),
    admin: str = Depends(require_login),
):
    submitted = {
        "locality": locality, "district": district, "admin_area": admin_area,
        "title": title, "latitude": latitude, "longitude": longitude,
        "kind": kind, "parent_point_id": parent_point_id,
    }
    with _conn() as conn:
        parents = _point_options(conn)
        form, err = _validate_point_form(conn, submitted, None)
        if form is None:
            return _render_point_edit(
                request, None, submitted, parents, error=err, status_code=422
            )
        try:
            with conn.transaction():
                row = conn.execute(
                    """
                    INSERT INTO route_points
                      (locality, district, admin_area, title, latitude, longitude,
                       kind, parent_point_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (form.locality, form.district, form.admin_area, form.title,
                     form.latitude, form.longitude, form.kind.value,
                     form.parent_point_id),
                ).fetchone()
        except psycopg.Error as exc:
            return _render_point_edit(
                request, None, submitted, parents,
                error=validation.db_error_message(exc, "route_points"), status_code=422,
            )
    return RedirectResponse(
        "/admin/route-points?msg=" + quote(f"Точка #{row[0]} создана."), status_code=303
    )


@app.get("/admin/route-points/{point_id}", response_class=HTMLResponse)
def route_point_edit_form(
    request: Request,
    point_id: int,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    with _conn() as conn:
        point = _fetch_point(conn, point_id)
        if point is None:
            return RedirectResponse(
                "/admin/route-points?error=" + quote("Точка не найдена."), status_code=303
            )
        parents = [p for p in _point_options(conn) if p["id"] != point_id]
    values = {f: point[f] for f in _POINT_EDIT_FIELDS}
    return _render_point_edit(request, point, values, parents, error=error, msg=msg)


@app.post("/admin/route-points/{point_id}", response_class=HTMLResponse)
def route_point_edit_save(
    request: Request,
    point_id: int,
    locality: str = Form(""),
    district: str = Form(""),
    admin_area: str = Form(""),
    title: str = Form(""),
    latitude: str = Form(""),
    longitude: str = Form(""),
    kind: str = Form(""),
    parent_point_id: str = Form(""),
    admin: str = Depends(require_login),
):
    submitted = {
        "locality": locality, "district": district, "admin_area": admin_area,
        "title": title, "latitude": latitude, "longitude": longitude,
        "kind": kind, "parent_point_id": parent_point_id,
    }
    with _conn() as conn:
        point = _fetch_point(conn, point_id)
        if point is None:
            return RedirectResponse(
                "/admin/route-points?error=" + quote("Точка не найдена."), status_code=303
            )
        parents = [p for p in _point_options(conn) if p["id"] != point_id]
        form, err = _validate_point_form(conn, submitted, point_id)
        if form is None:
            return _render_point_edit(
                request, point, submitted, parents, error=err, status_code=422
            )
        new_values = {
            "locality": form.locality, "district": form.district,
            "admin_area": form.admin_area, "title": form.title,
            "latitude": form.latitude, "longitude": form.longitude,
            "kind": form.kind.value, "parent_point_id": form.parent_point_id,
        }
        changed = {f: v for f, v in new_values.items() if v != point[f]}
        if not changed:
            return _render_point_edit(request, point, submitted, parents, msg="Изменений нет.")
        sets = [f"{f} = %s" for f in changed]
        try:
            with conn.transaction():
                conn.execute(
                    f"UPDATE route_points SET {', '.join(sets)} WHERE id = %s",
                    (*changed.values(), point_id),
                )
        except psycopg.Error as exc:
            return _render_point_edit(
                request, point, submitted, parents,
                error=validation.db_error_message(exc, "route_points"), status_code=422,
            )
    return RedirectResponse(
        f"/admin/route-points/{point_id}?msg=" + quote("Изменения сохранены."),
        status_code=303,
    )


@app.post("/admin/route-points/{point_id}/delete")
def route_point_delete(request: Request, point_id: int, admin: str = Depends(require_login)):
    """Удаление точки — только если на неё не ссылаются поездки, дочерние точки,
    шаблоны поездок и алерты (решение issue #471: отказ с причиной)."""
    with _conn() as conn:
        point = _fetch_point(conn, point_id)
        if point is None:
            return RedirectResponse(
                "/admin/route-points?error=" + quote("Точка не найдена."), status_code=303
            )
        extra = conn.execute(
            """
            SELECT (SELECT count(*) FROM trip_templates
                    WHERE start_point_id = %(id)s OR end_point_id = %(id)s),
                   (SELECT count(*) FROM route_alerts
                    WHERE from_point_id = %(id)s OR to_point_id = %(id)s)
            """,
            {"id": point_id},
        ).fetchone()
        templates_n, alerts_n = extra
        reasons = []
        if point["trips_n"]:
            reasons.append(f"поездки: {point['trips_n']}")
        if point["children_n"]:
            reasons.append(f"дочерние точки: {point['children_n']}")
        if templates_n:
            reasons.append(f"шаблоны поездок: {templates_n}")
        if alerts_n:
            reasons.append(f"алерты маршрутов: {alerts_n}")
        if reasons:
            err = "Удаление запрещено — на точку ссылаются (" + "; ".join(reasons) + ")."
            return RedirectResponse(
                f"/admin/route-points/{point_id}?error=" + quote(err), status_code=303
            )
        try:
            with conn.transaction():
                conn.execute("DELETE FROM route_points WHERE id = %s", (point_id,))
        except psycopg.Error as exc:
            return RedirectResponse(
                f"/admin/route-points/{point_id}?error="
                + quote(validation.db_error_message(exc, "route_points")),
                status_code=303,
            )
    return RedirectResponse(
        "/admin/route-points?msg=" + quote(f"Точка #{point_id} удалена."), status_code=303
    )


# --- Ошибки (error_traces, issue #470/#471) --------------------------------------

@app.get("/admin/errors", response_class=HTMLResponse)
def errors_list(
    request: Request,
    source: str = "",
    days: int = 0,
    page: int = 1,
    error: str | None = None,
    msg: str | None = None,
    admin: str = Depends(require_login),
):
    """Чтение трейсов с фильтром по source и периоду; записи не редактируются."""
    page = max(page, 1)
    where, params = [], []
    if source not in {s.value for s in validation.ErrorSource}:
        source = ""
    if source:
        where.append("e.source = %s")
        params.append(source)
    if days > 0:
        where.append("e.created_at >= now() - make_interval(days => %s)")
        params.append(days)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    with _conn() as conn:
        total = conn.execute(
            f"SELECT count(*) FROM error_traces e {where_sql}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT e.id, e.source, e.user_id, u.name, e.error_type, e.message,
                   e.stack, e.context, e.created_at
            FROM error_traces e
            LEFT JOIN users u ON u.id = e.user_id
            {where_sql}
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT %s OFFSET %s
            """,
            (*params, _PAGE_SIZE, (page - 1) * _PAGE_SIZE),
        ).fetchall()
    traces = [
        {
            "id": r[0], "source": r[1], "user_id": r[2], "user_name": r[3],
            "error_type": r[4], "message": r[5], "stack": r[6],
            "context": json.dumps(r[7], ensure_ascii=False) if r[7] else "",
            "created_at": r[8],
        }
        for r in rows
    ]
    return render(
        request, "errors_list.html", active="errors",
        traces=traces, total=total, page=page, pages=_pages(total),
        source=source, days=days,
        source_options=[s.value for s in validation.ErrorSource],
        error=error, msg=msg,
    )


@app.post("/admin/errors/{trace_id}/delete")
def error_trace_delete(request: Request, trace_id: int, admin: str = Depends(require_login)):
    with _conn() as conn:
        with conn.transaction():
            row = conn.execute(
                "DELETE FROM error_traces WHERE id = %s RETURNING id", (trace_id,)
            ).fetchone()
    if row is None:
        return RedirectResponse(
            "/admin/errors?error=" + quote("Запись не найдена."), status_code=303
        )
    return RedirectResponse(
        "/admin/errors?msg=" + quote(f"Трейс #{trace_id} удалён."), status_code=303
    )


@app.post("/admin/errors/purge")
def error_traces_purge(request: Request, days: int = 7, admin: str = Depends(require_login)):
    """Очистка трейсов старше N дней (кнопка «очистить старше 7 дней»)."""
    if days < 1:
        return RedirectResponse(
            "/admin/errors?error=" + quote("Период очистки — минимум 1 день."),
            status_code=303,
        )
    with _conn() as conn:
        with conn.transaction():
            cur = conn.execute(
                "DELETE FROM error_traces WHERE created_at < now() - make_interval(days => %s)",
                (days,),
            )
            purged = cur.rowcount
    return RedirectResponse(
        "/admin/errors?msg=" + quote(f"Удалено трейсов: {purged} (старше {days} дн.)."),
        status_code=303,
    )


def _gate_color(value: float, green_threshold: float, yellow_threshold: float, higher_is_better: bool) -> str:
    """Цветовая метка гейта. higher_is_better=True: value>=green → зелёный.
    higher_is_better=False (доля пустых): value<green → зелёный, value<=yellow → жёлтый."""
    if higher_is_better:
        if value >= green_threshold:
            return "green"
        if value >= yellow_threshold:
            return "yellow"
        return "red"
    if value < green_threshold:
        return "green"
    if value <= yellow_threshold:
        return "yellow"
    return "red"


@app.get("/admin/metrics", response_class=HTMLResponse)
def metrics(request: Request, days: int = 7, admin: str = Depends(require_login)):
    """Бизнес-метрики маркетплейса попуток (issue #445, CEO Council: ликвидность = KPI).

    Блок 1 — обзор (кумулятив), Блок 2 — за период (7 дн.) карточками, Блок 3 —
    roadmap-гейт с порогами/цветом (пороги — константы GATE_* вверху модуля),
    Блок 4 — недельный тренд (8 недель, date_trunc('week')), Блок 5 — существующая
    разбивка по коридорам за период. Период настраивается через ?days=.
    """
    period_days = max(1, days)
    with _conn() as conn:
        # --- Блок 5: разбивка по коридорам за период (существующая логика) ---
        rows = conn.execute(
            """
            SELECT
                COALESCE(corridor, '(без коридора)') AS corridor,
                COUNT(*) FILTER (WHERE type = 'search') AS searches,
                COUNT(*) FILTER (
                    WHERE type = 'search'
                      AND COALESCE((props->>'result_count')::int, -1) = 0
                ) AS zero_result,
                COUNT(*) FILTER (WHERE type = 'booking_created') AS bookings,
                COUNT(*) FILTER (WHERE type = 'alert_created') AS alerts
            FROM events
            WHERE created_at >= now() - (%s || ' days')::interval
            GROUP BY corridor
            ORDER BY searches DESC, corridor ASC
            """,
            (str(period_days),),
        ).fetchall()

        # --- Блок 1: обзор (кумулятив, всё время) ---
        (
            users_total,
            drivers_total,
            trips_total,
            trips_open,
            alerts_active,
        ) = conn.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM users) AS users_total,
                (SELECT COUNT(*) FROM users WHERE license_status = 'verified') AS drivers_total,
                (SELECT COUNT(*) FROM trips) AS trips_total,
                (SELECT COUNT(*) FROM trips WHERE status = 'open') AS trips_open,
                (SELECT COUNT(*) FROM route_alerts WHERE status = 'active') AS alerts_active
            """
        ).fetchone()

        # --- Блок 2/3: агрегаты за период (по таблицам, кроме events) ---
        (
            new_users,
            trips_published,
            trips_completed,
            active_drivers,
            bookings_week,
            alerts_week,
        ) = conn.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM users
                    WHERE created_at >= now() - (%(days)s || ' days')::interval) AS new_users,
                (SELECT COUNT(*) FROM trips
                    WHERE created_at >= now() - (%(days)s || ' days')::interval) AS trips_published,
                (SELECT COUNT(*) FROM trips
                    WHERE status = 'completed'
                      AND created_at >= now() - (%(days)s || ' days')::interval) AS trips_completed,
                (SELECT COUNT(DISTINCT driver_id) FROM trips
                    WHERE created_at >= now() - (%(days)s || ' days')::interval) AS active_drivers,
                (SELECT COUNT(*) FROM bookings
                    WHERE status = 'active'
                      AND created_at >= now() - (%(days)s || ' days')::interval) AS bookings_week,
                (SELECT COUNT(*) FROM route_alerts
                    WHERE created_at >= now() - (%(days)s || ' days')::interval) AS alerts_week
            """,
            {"days": str(period_days)},
        ).fetchone()

        # --- Блок 4: недельный тренд (последние 8 недель, ISO-понедельник) ---
        trend_rows = conn.execute(
            """
            WITH weeks AS (
                SELECT gs::date AS wk
                FROM generate_series(
                    date_trunc('week', now()) - interval '7 weeks',
                    date_trunc('week', now()),
                    interval '1 week'
                ) gs
            ),
            u AS (SELECT date_trunc('week', created_at)::date wk, COUNT(*) n
                  FROM users WHERE created_at >= date_trunc('week', now()) - interval '7 weeks' GROUP BY 1),
            tp AS (SELECT date_trunc('week', created_at)::date wk, COUNT(*) n
                   FROM trips WHERE created_at >= date_trunc('week', now()) - interval '7 weeks' GROUP BY 1),
            tc AS (SELECT date_trunc('week', created_at)::date wk, COUNT(*) n
                   FROM trips WHERE status = 'completed'
                     AND created_at >= date_trunc('week', now()) - interval '7 weeks' GROUP BY 1),
            bk AS (SELECT date_trunc('week', created_at)::date wk, COUNT(*) n
                   FROM bookings WHERE status = 'active'
                     AND created_at >= date_trunc('week', now()) - interval '7 weeks' GROUP BY 1),
            al AS (SELECT date_trunc('week', created_at)::date wk, COUNT(*) n
                   FROM route_alerts WHERE created_at >= date_trunc('week', now()) - interval '7 weeks' GROUP BY 1),
            ev AS (SELECT date_trunc('week', created_at)::date wk,
                       COUNT(*) FILTER (WHERE type = 'search') s,
                       COUNT(*) FILTER (
                           WHERE type = 'search'
                             AND COALESCE((props->>'result_count')::int, -1) = 0) z
                   FROM events WHERE created_at >= date_trunc('week', now()) - interval '7 weeks' GROUP BY 1)
            SELECT weeks.wk,
                COALESCE(u.n, 0)  AS new_users,
                COALESCE(tp.n, 0) AS trips_published,
                COALESCE(tc.n, 0) AS trips_completed,
                COALESCE(ev.s, 0) AS searches,
                COALESCE(ev.z, 0) AS empty_searches,
                COALESCE(bk.n, 0) AS bookings,
                COALESCE(al.n, 0) AS alerts
            FROM weeks
            LEFT JOIN u  ON u.wk  = weeks.wk
            LEFT JOIN tp ON tp.wk = weeks.wk
            LEFT JOIN tc ON tc.wk = weeks.wk
            LEFT JOIN bk ON bk.wk = weeks.wk
            LEFT JOIN al ON al.wk = weeks.wk
            LEFT JOIN ev ON ev.wk = weeks.wk
            ORDER BY weeks.wk DESC
            """
        ).fetchall()

    items = []
    totals = {"searches": 0, "zero_result": 0, "bookings": 0, "alerts": 0}
    for corridor, searches, zero_result, bookings, alerts in rows:
        totals["searches"] += searches
        totals["zero_result"] += zero_result
        totals["bookings"] += bookings
        totals["alerts"] += alerts
        items.append(
            {
                "corridor": corridor,
                "searches": searches,
                "zero_result": zero_result,
                "zero_result_rate": (zero_result / searches * 100) if searches else 0.0,
                "bookings": bookings,
                "alerts": alerts,
            }
        )
    totals["zero_result_rate"] = (
        (totals["zero_result"] / totals["searches"] * 100) if totals["searches"] else 0.0
    )

    empty_rate = totals["zero_result_rate"]

    overview = {
        "users_total": users_total,
        "drivers_total": drivers_total,
        "passengers_total": users_total - drivers_total,
        "trips_total": trips_total,
        "trips_open": trips_open,
        "alerts_active": alerts_active,
    }
    week = {
        "new_users": new_users,
        "trips_published": trips_published,
        "trips_completed": trips_completed,
        "active_drivers": active_drivers,
        "bookings": bookings_week,
        "alerts": alerts_week,
        "searches": totals["searches"],
        "empty_rate": empty_rate,
    }
    gate = [
        {
            "label": "Доля пустых поисков",
            "value": "%.0f%%" % empty_rate,
            "target": "цель <20% (зел.), 20–30% жёлт., >30% красн.",
            "caption": "реклама пассажирам оправдана при <20–30%",
            "color": _gate_color(empty_rate, GATE_EMPTY_SEARCH_GREEN, GATE_EMPTY_SEARCH_YELLOW, False),
        },
        {
            "label": "Активных водителей/нед",
            "value": active_drivers,
            "target": "цель ≥12 (зел.), 8–11 жёлт., <8 красн.",
            "caption": "цель ликвидности 8–12 регулярных водителей",
            "color": _gate_color(active_drivers, GATE_ACTIVE_DRIVERS_GREEN, GATE_ACTIVE_DRIVERS_YELLOW, True),
        },
        {
            "label": "Завершённых поездок/нед",
            "value": trips_completed,
            "target": "цель ≥40 (зел.), 20–39 жёлт., <20 красн.",
            "caption": "порог живого коридора 40–60 поездок/нед",
            "color": _gate_color(trips_completed, GATE_COMPLETED_TRIPS_GREEN, GATE_COMPLETED_TRIPS_YELLOW, True),
        },
    ]
    trend = [
        {
            "week": wk,
            "new_users": t_new_users,
            "trips_published": t_trips_pub,
            "trips_completed": t_trips_done,
            "searches": t_searches,
            "empty_rate": (t_empty / t_searches * 100) if t_searches else 0.0,
            "bookings": t_bookings,
            "alerts": t_alerts,
        }
        for (wk, t_new_users, t_trips_pub, t_trips_done, t_searches, t_empty, t_bookings, t_alerts) in trend_rows
    ]

    return render(
        request,
        "metrics.html",
        active="metrics",
        period_days=period_days,
        items=items,
        totals=totals,
        overview=overview,
        week=week,
        gate=gate,
        trend=trend,
    )


@app.get("/admin/account", response_class=HTMLResponse)
def account_form(request: Request, admin: str = Depends(require_login)):
    return render(request, "account.html", active="account")


@app.post("/admin/account/password")
def account_password(
    request: Request,
    admin: str = Depends(require_login),
    current: str = Form(...),
    new: str = Form(...),
    confirm: str = Form(...),
):
    with _conn() as conn:
        row = conn.execute(
            "SELECT password_hash FROM admin_users WHERE username = %s", (admin,)
        ).fetchone()
    if not row or not _verify(current, row[0]):
        return render(request, "account.html", active="account", error="Текущий пароль неверный")
    if len(new) < 8:
        return render(request, "account.html", active="account", error="Новый пароль — минимум 8 символов")
    if new != confirm:
        return render(request, "account.html", active="account", error="Новый пароль и подтверждение не совпадают")
    with _conn() as conn:
        conn.execute(
            "UPDATE admin_users SET password_hash = %s WHERE username = %s",
            (PWD.hash(new), admin),
        )
    return render(request, "account.html", active="account", msg="Пароль обновлён")
