from app.main import calculate_metrics, hourly_actuals, latest_forecasts, parse_time


def test_metrics_ignore_unmatched_hours_and_zero_denominators():
    result = calculate_metrics(
        [
            {"forecast_mw": 120.0, "actual_mw": 100.0},
            {"forecast_mw": 0.0, "actual_mw": 0.0},
            {"forecast_mw": 500.0, "actual_mw": None},
        ]
    )
    assert result["matched_hours"] == 2
    assert result["mae_mw"] == 10.0
    assert result["bias_mw"] == 10.0
    assert result["mape_percent"] == 20.0
    assert result["forecast_coverage_percent"] == 66.7


def test_actual_half_hours_are_averaged_to_forecast_hour():
    result = hourly_actuals(
        [
            {"fuelType": "WIND", "startTime": "2026-01-01T00:00:00Z", "generation": 100},
            {"fuelType": "WIND", "startTime": "2026-01-01T00:30:00Z", "generation": 200},
            {"fuelType": "GAS", "startTime": "2026-01-01T00:00:00Z", "generation": 999},
        ]
    )
    assert result[parse_time("2026-01-01T00:00:00Z")] == 150.0


def test_forecast_selection_uses_latest_publish_before_cutoff():
    rows = [
        {
            "startTime": "2026-01-01T01:00:00Z",
            "publishTime": "2025-12-31T08:00:00Z",
            "generation": 100,
        },
        {
            "startTime": "2026-01-01T01:00:00Z",
            "publishTime": "2025-12-31T11:30:00Z",
            "generation": 120,
        },
        {
            "startTime": "2026-01-01T01:00:00Z",
            "publishTime": "2025-12-31T12:30:00Z",
            "generation": 999,
        },
    ]
    cutoff = parse_time("2025-12-31T12:00:00Z")
    assert latest_forecasts(rows, cutoff) == {
        parse_time("2026-01-01T01:00:00Z"): 120.0
    }
