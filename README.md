# WindView

WindView is a day-ahead wind forecast decision-support pilot for a UK electricity trading desk. It presents Elexon national wind generation forecasts alongside verified actual generation and quantifies forecast error for delivery dates in January 2026.

**Backend choice:** FastAPI was selected over Flask and Django for its typed request validation, generated OpenAPI documentation, async-friendly HTTP integration, and lightweight API-first deployment.

## Product scope and methodology

- **Actuals:** Elexon BMRS `FUELHH`, filtered to `fuelType=WIND`, with 30-minute generation data.
- **Forecasts:** Elexon BMRS `WINDFOR`, with publication timestamps retained to select only information available at the decision cutoff.
- **Decision vintage:** The latest forecast published at or before the configurable cutoff (default 12:00 UTC on the day before delivery). This is an explicit pilot assumption, not a claim about a client's specific trading gate or market process.
- **Comparison:** The source actuals are half-hourly while WINDFOR is hourly. Actuals are averaged within each UTC hour to align to the forecast's hourly start time. The dashboard shows MW, not energy (MWh).
- **Metrics:** MAE is the mean absolute forecast error; signed bias is forecast minus actual (positive means over-forecast); daily and monthly calculations use only matched forecast/actual hours. Forecast coverage is reported separately. MAPE is available per delivery day and excludes zero actuals.
- All timestamps and cutoff controls are explicitly UTC. Missing upstream data is reported; the app does not invent sample values.

This is decision support, not an automated dispatch or procurement recommendation. Demand, market prices, reserve, constraints, and non-wind generation are deliberately out of scope.

## Repository layout

```text
backend/
  app/main.py             FastAPI routes, Elexon integration and verification metrics
  tests/test_metrics.py   Unit tests for alignment, vintage selection and metrics
  requirements.txt        Python dependencies
  Dockerfile              API image
frontend/
  src/App.tsx             Dashboard and Elexon data visualization
  src/styles.css          Responsive dashboard styling
  src/main.tsx            React entry point
  Dockerfile              Production Vite build served by Nginx
  nginx.conf              SPA fallback and backend API proxy
docker-compose.yml        Local multi-container deployment
```

## Run with Docker

From the repository root:

```sh
docker compose up --build
```

Open <http://localhost:8080>. The backend health endpoint is available at <http://localhost:8080/health>; interactive API documentation is at <http://localhost:8000/docs> when the backend port is temporarily published locally.

To expose backend docs on the host, add `- "8000:8000"` under `backend.ports` in `docker-compose.yml`; the API is otherwise kept on the private Compose network.

## Run locally without Docker

Backend (Python 3.12+):

```sh
cd backend
python -m venv .venv
# Activate .venv for your shell, then:
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend (Node 20+):

```sh
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` and `/health` to `http://localhost:8000` by default.

## API

- `GET /health`
- `GET /api/analytics?month=2026-01&decision_hour=12`
- `GET /api/day?date=2026-01-15&decision_hour=12`

`decision_hour` is an hour from 0 to 23 and sets the UTC day-before cutoff. Responses are cached in process for 15 minutes to reduce upstream load. API failures surface as 502 responses and are shown in the UI.

## Tests and build

```sh
cd backend
pip install -r requirements.txt
pip install pytest
python -m pytest
```

```sh
cd frontend
npm install
npm run build
```

## Deployment and demo

No public deployment URL or client-ready demo video has been created as part of this source-code pilot. Publishing requires access to a hosting account and an authorized public GitHub repository; recording and uploading an unlisted YouTube video and submitting the external form require the user's account and approval. Deploy to a Docker-compatible host (for example, Render or Heroku) using the root Compose setup, or deploy the frontend and backend separately with `VITE_API_URL` and `CORS_ORIGINS` configured for their public origins.

## AI assistance

AI tools were used to assist with product design, implementation, documentation, and validation.
