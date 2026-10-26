# WindView

WindView is a day-ahead wind forecast analytics dashboard for UK electricity trading teams. It uses Elexon BMRS data to compare national wind generation forecasts with actual generation and measure forecast accuracy for January 2026.

Tech Stack: React, JavaScript, Tailwind CSS, FastAPI, Python, Docker.

 Features

- Visualizes forecast and actual wind generation.
- Selects forecasts available before the configurable day-ahead cutoff (default: 12:00 UTC).
- Calculates MAE, signed bias, and MAPE.
- Reports data coverage and upstream API errors.
- Uses hourly forecasts matched with hourly averages of actual generation.

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

Open [http://localhost:5173](http://localhost:5173) to access the dashboard.

Stop the application:

bash
docker compose down


 Run Locally

Backend:

bash
cd backend
python -m venv .venv
pip install -r requirements.txt
uvicorn app.main:app --reload


Frontend (in a separate terminal):

bash
cd frontend
npm install
npm run dev


 API Endpoints

- `GET /health`
- `GET /api/analytics?month=2026-01&decision_hour=12`
- `GET /api/day?date=2026-01-15&decision_hour=12`
- Interactive API documentation: `/docs`

 Deployment

Live Application: https://windview-d78sk4ih2-parth-mishras-projects.vercel.app/

Deployment URL: https://windview-d78sk4ih2-parth-mishras-projects.vercel.app/

 AI Assistance

AI tools like Claude and Copilot were used to assist with the development of this application to increase the speed of development of this application and to look into the errors generated while development.
