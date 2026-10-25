from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("windview")
ELEXON_API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CLIENT_TIMEOUT = httpx.Timeout(20.0, connect=8.0)
MAX_CONCURRENT_REQUESTS = 6
_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = asyncio.Lock()
CACHE_TTL_SECONDS = 900

app = FastAPI(
    title="WindView API",
    description="National wind forecast monitoring and day-ahead forecast verification.",
    version="1.0.0",
)
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins if origin.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)


async def fetch_dataset(
    client: httpx.AsyncClient, dataset: str, params: dict[str, str]
) -> list[dict[str, Any]]:
    response = await client.get(f"{ELEXON_API}/{dataset}", params=params)
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ValueError(f"Elexon returned an unexpected {dataset} response")
    return [row for row in rows if isinstance(row, dict)]


async def cached_fetch(
    client: httpx.AsyncClient, dataset: str, params: dict[str, str]
) -> list[dict[str, Any]]:
    cache_key = f"{dataset}:{'&'.join(f'{k}={v}' for k, v in sorted(params.items()))}"
    now = asyncio.get_running_loop().time()
    async with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]
    rows = await fetch_dataset(client, dataset, params)
    async with _cache_lock:
        _cache[cache_key] = (asyncio.get_running_loop().time() + CACHE_TTL_SECONDS, rows)
    return rows


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def hourly_actuals(rows: list[dict[str, Any]]) -> dict[datetime, float]:
    grouped: dict[datetime, list[float]] = defaultdict(list)
    for row in rows:
        if row.get("fuelType") != "WIND":
            continue
        start = parse_time(row.get("startTime"))
        generation = row.get("generation")
        if start is None or not isinstance(generation, (int, float)):
            continue
        hour = start.replace(minute=0, second=0, microsecond=0)
        grouped[hour].append(float(generation))
    return {hour: sum(values) / len(values) for hour, values in grouped.items()}


def latest_forecasts(rows: list[dict[str, Any]], cutoff: datetime) -> dict[datetime, float]:
    latest: dict[datetime, tuple[datetime, float]] = {}
    for row in rows:
        start = parse_time(row.get("startTime"))
        published = parse_time(row.get("publishTime"))
        generation = row.get("generation")
        if start is None or published is None or published > cutoff:
            continue
        if not isinstance(generation, (int, float)):
            continue
        prior = latest.get(start)
        if prior is None or published > prior[0]:
            latest[start] = (published, float(generation))
    return {start: values[1] for start, values in latest.items()}


async def get_day_series(
    client: httpx.AsyncClient, target_day: date, decision_hour: int
) -> list[dict[str, Any]]:
    target_start = datetime.combine(target_day, time.min, tzinfo=timezone.utc)
    target_end = target_start + timedelta(days=1)
    cutoff = target_start - timedelta(days=1) + timedelta(hours=decision_hour)
    publish_from = cutoff.replace(hour=0, minute=0, second=0)
    actual_rows, forecast_rows = await asyncio.gather(
        cached_fetch(
            client,
            "FUELHH",
            {
                "fuelType": "WIND",
                "settlementDateFrom": target_day.isoformat(),
                "settlementDateTo": target_day.isoformat(),
            },
        ),
        cached_fetch(
            client,
            "WINDFOR",
            {
                "publishDateTimeFrom": publish_from.isoformat().replace("+00:00", "Z"),
                "publishDateTimeTo": cutoff.isoformat().replace("+00:00", "Z"),
            },
        ),
    )
    actuals = hourly_actuals(actual_rows)
    forecasts = latest_forecasts(forecast_rows, cutoff)
    result = []
    hour = target_start
    while hour < target_end:
        actual = actuals.get(hour)
        forecast = forecasts.get(hour)
        result.append(
            {
                "start_time": hour.isoformat().replace("+00:00", "Z"),
                "actual_mw": round(actual, 1) if actual is not None else None,
                "forecast_mw": round(forecast, 1) if forecast is not None else None,
                "error_mw": round(forecast - actual, 1)
                if actual is not None and forecast is not None
                else None,
            }
        )
        hour += timedelta(hours=1)
    return result


def calculate_metrics(series: list[dict[str, Any]]) -> dict[str, Any]:
    pairs = [
        (row["forecast_mw"], row["actual_mw"])
        for row in series
        if row["forecast_mw"] is not None and row["actual_mw"] is not None
    ]
    if not pairs:
        return {
            "matched_hours": 0,
            "mae_mw": None,
            "bias_mw": None,
            "mape_percent": None,
            "forecast_coverage_percent": 0.0,
            "mean_forecast_mw": None,
            "mean_actual_mw": None,
        }
    errors = [forecast - actual for forecast, actual in pairs]
    nonzero_actuals = [
        abs(forecast - actual) / abs(actual) * 100
        for forecast, actual in pairs
        if actual != 0
    ]
    total_intervals = len(series)
    return {
        "matched_hours": len(pairs),
        "mae_mw": round(sum(abs(error) for error in errors) / len(errors), 1),
        "bias_mw": round(sum(errors) / len(errors), 1),
        "mape_percent": round(sum(nonzero_actuals) / len(nonzero_actuals), 1)
        if nonzero_actuals
        else None,
        "forecast_coverage_percent": round(len(pairs) / total_intervals * 100, 1)
        if total_intervals
        else 0.0,
        "mean_forecast_mw": round(sum(pair[0] for pair in pairs) / len(pairs), 1),
        "mean_actual_mw": round(sum(pair[1] for pair in pairs) / len(pairs), 1),
    }


async def with_elexon_client(operation):
    async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as client:
        try:
            return await operation(client)
        except httpx.HTTPStatusError as exc:
            logger.exception("Elexon API returned HTTP %s", exc.response.status_code)
            raise HTTPException(
                status_code=502,
                detail=f"Elexon data service returned HTTP {exc.response.status_code}. Please retry shortly.",
            ) from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.exception("Unable to retrieve or parse Elexon data")
            raise HTTPException(
                status_code=502,
                detail="Could not retrieve valid data from Elexon. Please retry shortly.",
            ) from exc


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/day")
async def day_view(
    target_date: date = Query(alias="date"),
    decision_hour: int = Query(default=12, ge=0, le=23),
) -> dict[str, Any]:
    if target_date.year != 2026 or target_date.month != 1:
        raise HTTPException(status_code=422, detail="Only delivery dates in January 2026 are in scope.")
    series = await with_elexon_client(lambda client: get_day_series(client, target_date, decision_hour))
    return {
        "date": target_date.isoformat(),
        "decision_cutoff_utc": (
            datetime.combine(target_date, time.min, tzinfo=timezone.utc)
            - timedelta(days=1)
            + timedelta(hours=decision_hour)
        ).isoformat().replace("+00:00", "Z"),
        "series": series,
        "metrics": calculate_metrics(series),
    }


@app.get("/api/analytics")
async def month_analytics(
    month: str = Query(default="2026-01", pattern=r"^2026-01$"),
    decision_hour: int = Query(default=12, ge=0, le=23),
) -> dict[str, Any]:
    del month

    async def load_month(client: httpx.AsyncClient) -> list[dict[str, Any]]:
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

        async def load_one(day_number: int) -> dict[str, Any]:
            target_day = date(2026, 1, day_number)
            async with semaphore:
                series = await get_day_series(client, target_day, decision_hour)
            metrics = calculate_metrics(series)
            return {
                "date": target_day.isoformat(),
                "mae_mw": metrics["mae_mw"],
                "bias_mw": metrics["bias_mw"],
                "matched_hours": metrics["matched_hours"],
                "mean_forecast_mw": metrics["mean_forecast_mw"],
                "mean_actual_mw": metrics["mean_actual_mw"],
            }

        return await asyncio.gather(*(load_one(day) for day in range(1, 32)))

    daily = await with_elexon_client(load_month)
    total_hours = sum(day["matched_hours"] for day in daily)
    valid_mae = [day for day in daily if day["mae_mw"] is not None]
    monthly_mae = (
        round(
            sum(day["mae_mw"] * day["matched_hours"] for day in valid_mae)
            / total_hours,
            1,
        )
        if total_hours
        else None
    )
    monthly_bias = (
        round(
            sum(day["bias_mw"] * day["matched_hours"] for day in valid_mae)
            / total_hours,
            1,
        )
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
        "month": "2026-01",
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
