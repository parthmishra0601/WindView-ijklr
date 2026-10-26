 WindView

WindView is a day-ahead wind forecast analytics dashboard for UK electricity trading teams. It uses Elexon BMRS data to compare national wind generation forecasts with actual generation and measure forecast accuracy for January 2026.

Tech stack: React, JavaScript, Tailwind CSS, FastAPI, Python, and Docker.

 Features

- Visualizes forecast and actual wind generation.
- Selects forecasts available before a configurable day-ahead cutoff (default: 12:00 UTC).
- Calculates mean absolute error (MAE), signed bias, and mean absolute percentage error (MAPE).
- Reports data coverage and upstream API errors.
- Matches hourly forecasts with hourly averages of actual generation.
- Provides daily accuracy analysis and CSV export.

 Project Structure

text
backend/
  app/main.py       # FastAPI endpoints
  app/services.py   # Elexon data processing and metrics
  tests/            # Backend tests
  requirements.txt  # Python dependencies
  Dockerfile
frontend/
  src/App.jsx       # Dashboard UI
  src/ForecastChart.jsx
  src/styles.css    # Styling
  src/main.jsx      # React entry point
  Dockerfile
  nginx.conf
  vite.config.js
docker-compose.yml


 Run with Docker

Requirements: Docker Engine and Docker Compose.

bash
docker compose up --build


Open [http://localhost:8080](http://localhost:8080) to access the dashboard.

Stop the application:

bash
docker compose down


 Run Locally

# Backend

bash
cd backend
python -m venv .venv


Activate the virtual environment, then install dependencies and start the API:

bash
pip install -r requirements.txt
uvicorn app.main:app --reload


The backend runs at [http://localhost:8000](http://localhost:8000). Interactive API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

# Frontend

In a separate terminal:

bash
cd frontend
npm install
npm run dev


Open [http://localhost:5173](http://localhost:5173). During local development, Vite proxies /api and /health requests to the backend on port 8000.

 API Endpoints

- GET /health — Health check
- GET /api/analytics?month=2026-01&decision_hour=12 — Monthly analytics
- GET /api/day?date=2026-01-15&decision_hour=12 — Daily forecast and actuals
- /docs — Interactive API documentation

 Tests

Run the backend tests from the repository root:

bash
pytest


 Deployment

- Live application: https://windview-d78sk4ih2-parth-mishras-projects.vercel.app/
- Frontend hosting: Vercel
- Backend hosting: Google Cloud Run
- Backend health check: https://windview-api-763286302009.europe-west1.run.app/health

The Vercel frontend uses VITE_API_URL to locate the backend API. Configure the backend's CORS_ORIGINS environment variable with the exact frontend origin.

 Scope and Data

This pilot analyzes historical UK national wind generation data for January 2026. It is not a live forecasting service. Forecasts are selected using their publication time relative to the chosen day-ahead cutoff; actual generation is averaged to hourly periods before comparison.

 AI Assistance

AI tools, including Claude and Copilot, assisted with development and troubleshooting.
