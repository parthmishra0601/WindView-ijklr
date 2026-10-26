from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services import calculate_metrics


def test_health_endpoint():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_day_endpoint_preserves_response_shape():
    series = [
        {
            "start_time": "2026-01-15T00:00:00Z",
            "actual_mw": 100.0,
            "forecast_mw": 120.0,
            "error_mw": 20.0,
        }
    ]
    with patch("app.main.services.with_elexon_client", return_value=series):
        with TestClient(app) as client:
            response = client.get("/api/day?date=2026-01-15&decision_hour=12")

    assert response.status_code == 200
    assert response.json()["date"] == "2026-01-15"
    assert response.json()["decision_cutoff_utc"] == "2026-01-14T12:00:00Z"
    assert response.json()["series"] == series
    assert response.json()["metrics"] == calculate_metrics(series)


def test_day_validation_and_month_validation():
    with TestClient(app) as client:
        assert client.get("/api/day?date=2026-02-01").status_code == 422
        assert client.get("/api/day?date=2026-01-15&decision_hour=24").status_code == 422
        assert client.get("/api/analytics?month=2026-02").status_code == 422
