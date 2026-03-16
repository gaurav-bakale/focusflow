# ⚡ FocusFlow

> Your unified productivity workspace — task management, Pomodoro timer, time-blocking calendar, and AI assistance in one app.

**Team:** Productivity Pros (Pro-Pros) | CSYE 7230  
**GitHub:** [github.com/gaurav-bakale/focusflow](https://github.com/gaurav-bakale/focusflow)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Tailwind CSS + React Router |
| Backend | Python 3.11 + FastAPI + Pydantic |
| Database | MongoDB 6 (Motor async driver) |
| AI | OpenAI API (gpt-4o-mini) |
| Auth | JWT (python-jose) + bcrypt |
| CI/CD | GitHub Actions |
| Containers | Docker + Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 18+](https://nodejs.org/) for local frontend dev
- [Python 3.11+](https://python.org/) for local backend dev
- An [OpenAI API key](https://platform.openai.com/) — optional; core features work without it

---

## Quick Start — Docker (Recommended)

```bash
# 1. Clone
git clone https://github.com/gaurav-bakale/focusflow.git
cd focusflow

# 2. Configure environment
cp .env.example .env
# Edit .env: set JWT_SECRET and OPENAI_API_KEY

# 3. Build and start all containers
docker-compose up --build

# 4. Open the app
#    App:         http://localhost:3000
#    API Swagger: http://localhost:8000/docs
#    API ReDoc:   http://localhost:8000/redoc

# 5. Stop
docker-compose down
```

---

## Local Development (No Docker)

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
```

Ensure MongoDB is running locally on port 27017.

---

## Running Tests

### Frontend — Jest

```bash
cd frontend
npm test                   # watch mode
npm run test:coverage      # single run + coverage report
```

Test files in `frontend/src/tests/`:

| File | Tests | Coverage |
|---|---|---|
| `TaskService.test.js` | 11 tests | Task CRUD service |
| `TimerPage.test.jsx` | 9 tests | Pomodoro timer component |
| `AuthPages.test.jsx` | 5 tests | Login / Register pages |

### Backend — pytest

```bash
cd backend
pytest tests/ -v
pytest tests/ -v --cov=app    # with coverage
```

Test file: `tests/backend/test_api.py` — 7 tests covering auth and task endpoints.

---

## CI/CD Pipeline

Runs on every push to `main`/`develop` and on pull requests to `main`.

```
Push / PR
   |
   v
[1] Lint    ESLint (frontend) + flake8 (backend)
   |
   v
[2] Test    Jest + pytest  (live MongoDB container)
   |
   v
[3] Build   Docker images  (pushed to Docker Hub on main)
   |
   v
[4] Deploy  docker-compose up  (main branch only)
```

Pipeline: `.github/workflows/ci.yml`

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub access token |
| `MONGODB_URL` | Production MongoDB URL |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI key for AI features |

---

## Project Structure

```
focusflow/
├── frontend/src/
│   ├── pages/        LoginPage, RegisterPage, DashboardPage,
│   │                 TasksPage, TimerPage, CalendarPage, CanvasAIPage
│   ├── components/   Layout (sidebar + navigation)
│   ├── context/      AuthContext, TimerContext
│   ├── services/     api.js, taskService.js, authService.js, otherServices.js
│   └── tests/        Jest test suites
├── backend/app/
│   ├── routers/      auth, tasks, timer, calendar, ai
│   ├── main.py       FastAPI entry point
│   ├── models.py     Pydantic schemas
│   ├── auth.py       JWT + bcrypt
│   └── db.py         MongoDB singleton
├── tests/backend/    pytest test suite
├── .github/workflows/ci.yml
├── docker-compose.yml
└── .env.example
```

---

## API Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc
- Static HTML: `/docs/api/index.html`

---

## User Manual

[FocusFlow Wiki](https://github.com/gaurav-bakale/focusflow/wiki)

---

## Team

| Name | Role | NUID |
|---|---|---|
| Gaurav Bakale | Frontend / Full Stack | 002313152 |
| Vishwesh Gopikrishnan | Backend / Architecture | 002309454 |
| Karan Srinivas | Frontend UI | 002474804 |
| Vihar Kishorbhai Kothiya | Backend API | 002029223 |
| Sheshu Vrathan Tadaka | Testing / Integration | 002308630 |
