from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app import services

logger = logging.getLogger("windview")

app = FastAPI(
    title="WindView API",
    description="National wind forecast monitoring and day-ahead forecast verification.",
    version="2.1.0",
)
origins = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins if origin.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/day")
def day_view(
    target_date: date = Query(alias="date"),
    decision_hour: int = Query(default=12, ge=0, le=23),
):
    if target_date.year != 2026 or target_date.month != 1:
        raise HTTPException(
            status_code=422, detail="Only delivery dates in January 2026 are in scope."
        )

    try:
        series = services.with_elexon_client(
            lambda client: services.get_day_series(client, target_date, decision_hour)
        )
    except services.ElexonDataError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc

    cutoff = (
        datetime.combine(target_date, time.min, tzinfo=timezone.utc)
        - timedelta(days=1)
        + timedelta(hours=decision_hour)
    )
    return {
        "date": target_date.isoformat(),
        "decision_cutoff_utc": cutoff.isoformat().replace("+00:00", "Z"),
        "series": series,
        "metrics": services.calculate_metrics(series),
    }


def _daily_summary(client, day_number: int, decision_hour: int):
    target_day = date(2026, 1, day_number)
    series = services.get_day_series(client, target_day, decision_hour)
    metrics = services.calculate_metrics(series)
    return {
        "date": target_day.isoformat(),
        "mae_mw": metrics["mae_mw"],
        "bias_mw": metrics["bias_mw"],
        "matched_hours": metrics["matched_hours"],
        "mean_forecast_mw": metrics["mean_forecast_mw"],
        "mean_actual_mw": metrics["mean_actual_mw"],
    }


@app.get("/api/analytics")
def month_analytics(
    month: str = Query(default="2026-01", pattern=r"^2026-01$"),
    decision_hour: int = Query(default=12, ge=0, le=23),
):
    def load_month(client):
        with ThreadPoolExecutor(max_workers=services.MAX_CONCURRENT_REQUESTS) as executor:
            return list(
                executor.map(
                    lambda day_number: _daily_summary(client, day_number, decision_hour),
                    range(1, 32),
                )
            )

    try:
        daily = services.with_elexon_client(load_month)
    except services.ElexonDataError as exc:
        raise HTTPException(status_code=502, detail=exc.detail) from exc

    total_hours = sum(day["matched_hours"] for day in daily)
    valid_mae = [day for day in daily if day["mae_mw"] is not None]
    monthly_mae = (
        round(sum(day["mae_mw"] * day["matched_hours"] for day in valid_mae) / total_hours, 1)
        if total_hours
        else None
    )
    monthly_bias = (
        round(sum(day["bias_mw"] * day["matched_hours"] for day in valid_mae) / total_hours, 1)
        if total_hours
        else None
    )
    actual_total = sum(
        day["mean_actual_mw"] * day["matched_hours"]
        for day in daily
        if day["mean_actual_mw"] is not None
    )
    forecast_total = sum(
        day["mean_forecast_mw"] * day["matched_hours"]
        for day in daily
        if day["mean_forecast_mw"] is not None
    )
    return {
        "month": month,
        "decision_hour_utc": decision_hour,
        "decision_rule": (
            f"Latest WINDFOR value published by {decision_hour:02d}:00 UTC "
            "on the day before delivery"
        ),
        "daily": daily,
        "metrics": {
            "matched_hours": total_hours,
            "mae_mw": monthly_mae,
            "bias_mw": monthly_bias,
            "forecast_coverage_percent": round(total_hours / (31 * 24) * 100, 1),
            "mean_actual_mw": round(actual_total / total_hours, 1) if total_hours else None,
            "mean_forecast_mw": round(forecast_total / total_hours, 1) if total_hours else None,
        },
    }
