"""Веб-админка Yaride_prewarm.

Тонкий слой над схемой prewarm (БД yaride_prewarm) — без переноса repo.py
основного приложения. Переиспользует UI/стиль Yaride-админки. MVP:
вход, дашборд-счётчики, модерация ВУ (license_requests), список пользователей.

Авторизация: сессия + таблица prewarm.admin_users (pbkdf2_sha256).
Бутстрап первого админа — из env ADMIN_BOOTSTRAP_USER/ADMIN_BOOTSTRAP_PASS.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
from passlib.context import CryptContext
from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

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
        },
    )


@app.get("/admin/drivers/pending", response_class=HTMLResponse)
def drivers_pending(request: Request, admin: str = Depends(require_login)):
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
    return render(request, "drivers_pending.html", active="drivers", items=items, pending_count=len(items))


@app.post("/admin/drivers/{req_id}/approve")
def driver_approve(request: Request, req_id: int, admin: str = Depends(require_login)):
    _review_license(req_id, "approved", "verified", admin)
    return RedirectResponse("/admin/drivers/pending", status_code=303)


@app.post("/admin/drivers/{req_id}/reject")
def driver_reject(request: Request, req_id: int, admin: str = Depends(require_login)):
    _review_license(req_id, "rejected", "rejected", admin)
    return RedirectResponse("/admin/drivers/pending", status_code=303)


def _review_license(req_id: int, req_status: str, user_status: str, reviewer: str) -> None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT driver_id FROM license_requests WHERE id = %s AND status = 'pending'",
            (req_id,),
        ).fetchone()
        if not row:
            return
        driver_id = row[0]
        conn.execute(
            "UPDATE license_requests SET status=%s, reviewed_at=CURRENT_TIMESTAMP, reviewer=%s"
            " WHERE id=%s",
            (req_status, reviewer, req_id),
        )
        conn.execute("UPDATE users SET license_status=%s WHERE id=%s", (user_status, driver_id))


@app.get("/admin/users", response_class=HTMLResponse)
def users_list(request: Request, admin: str = Depends(require_login)):
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
    return render(request, "users_list.html", active="users", users=users)


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
