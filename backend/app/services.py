from __future__ import annotations

import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone
from threading import Lock
from time import monotonic
from typing import Any

import httpx

logger = logging.getLogger("windview")
ELEXON_API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CLIENT_TIMEOUT = httpx.Timeout(20.0, connect=8.0)
MAX_CONCURRENT_REQUESTS = 6
_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = Lock()
CACHE_TTL_SECONDS = 900


def fetch_dataset(
    client: httpx.Client, dataset: str, params: dict[str, str]
) -> list[dict[str, Any]]:
    response = client.get(f"{ELEXON_API}/{dataset}", params=params)
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ValueError(f"Elexon returned an unexpected {dataset} response")
    return [row for row in rows if isinstance(row, dict)]


def cached_fetch(
    client: httpx.Client, dataset: str, params: dict[str, str]
) -> list[dict[str, Any]]:
    cache_key = f"{dataset}:{'&'.join(f'{k}={v}' for k, v in sorted(params.items()))}"
    now = monotonic()
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]
    rows = fetch_dataset(client, dataset, params)
    with _cache_lock:
        _cache[cache_key] = (monotonic() + CACHE_TTL_SECONDS, rows)
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


def get_day_series(
    client: httpx.Client, target_day: date, decision_hour: int
) -> list[dict[str, Any]]:
    target_start = datetime.combine(target_day, time.min, tzinfo=timezone.utc)
    target_end = target_start + timedelta(days=1)
    cutoff = target_start - timedelta(days=1) + timedelta(hours=decision_hour)
    publish_from = cutoff.replace(hour=0, minute=0, second=0)
    with ThreadPoolExecutor(max_workers=2) as executor:
        actual_future = executor.submit(
            cached_fetch,
            client,
            "FUELHH",
            {
                "fuelType": "WIND",
                "settlementDateFrom": target_day.isoformat(),
                "settlementDateTo": target_day.isoformat(),
            },
        )
        forecast_future = executor.submit(
            cached_fetch,
            client,
            "WINDFOR",
            {
                "publishDateTimeFrom": publish_from.isoformat().replace("+00:00", "Z"),
                "publishDateTimeTo": cutoff.isoformat().replace("+00:00", "Z"),
            },
        )
        actual_rows = actual_future.result()
        forecast_rows = forecast_future.result()
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


class ElexonDataError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def with_elexon_client(operation):
    with httpx.Client(timeout=CLIENT_TIMEOUT) as client:
        try:
            return operation(client)
        except httpx.HTTPStatusError as exc:
            logger.exception("Elexon API returned HTTP %s", exc.response.status_code)
            raise ElexonDataError(
                f"Elexon data service returned HTTP {exc.response.status_code}. Please retry shortly."
            ) from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.exception("Unable to retrieve or parse Elexon data")
            raise ElexonDataError(
                "Could not retrieve valid data from Elexon. Please retry shortly."
            ) from exc
