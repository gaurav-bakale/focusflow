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
| Database | MongoDB 7 (Motor async driver) |
| AI | Google Gemini API + OpenAI API (user-configurable) |
| Auth | JWT (PyJWT) + bcrypt + passlib |
| Real-time | WebSocket (collaboration notifications) |
| Scheduler | APScheduler (deadline notifications) |
| CI/CD | GitHub Actions |
| Containers | Docker + Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 18+](https://nodejs.org/) for local frontend dev
- [Python 3.11+](https://python.org/) for local backend dev
- A MongoDB instance — local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier)
- A [Gemini API key](https://aistudio.google.com/app/apikey) or [OpenAI API key](https://platform.openai.com/) — optional; AI features are opt-in

---

## Environment Setup

### 1. Copy the example environment file

```bash
cp .env.example backend/.env
```

### 2. Fill in your values

Open `backend/.env` and set at minimum:

```env
# MongoDB Atlas (recommended)
MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/focusflow?retryWrites=true&w=majority

# JWT — generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=your-long-random-secret-here

# AI features (optional — users can also add their own key in Settings)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

See `.env.example` for the full list of all available variables with descriptions.

> ⚠️ Never commit `backend/.env` to version control. It is listed in `.gitignore`.

---

## Quick Start — Docker (Recommended)

```bash
# 1. Clone
git clone https://github.com/gaurav-bakale/focusflow.git
cd focusflow

# 2. Set up environment
cp .env.example backend/.env
# Edit backend/.env — fill in MONGODB_URL and JWT_SECRET at minimum

# 3. Build and start all containers
docker-compose up --build

# 4. Open the app
#    App:         http://localhost:3001
#    API Swagger: http://localhost:8000/docs
#    API ReDoc:   http://localhost:8000/redoc

# 5. Stop
docker-compose down
```

### Password requirements

When creating an account your password must contain:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 number
- At least 1 special character (e.g. `!@#$%`)

Example: `MyPass@123`

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
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # http://localhost:8000
```

The backend loads `backend/.env` automatically via `python-dotenv`.

---

## Features

| Feature | Description |
|---|---|
| **Task Management** | Kanban board, priorities, deadlines, recurring tasks, subtasks, categories |
| **Pomodoro Timer** | Configurable work/break durations, session logging, streak tracking |
| **Time Blocking** | Weekly calendar with drag-to-create blocks, recurring series, auto-schedule on task creation |
| **AI Assistant** | Task breakdown, prioritization, goal-based task generation, daily scheduling, productivity tips |
| **Collaboration** | Task sharing, team workspaces, activity feed, real-time WebSocket notifications |
| **Comments** | Per-task threaded comments |
| **Notifications** | Deadline reminders via background scheduler and real-time push |
| **Data Export** | Export tasks, sessions, and calendar blocks as CSV or JSON |
| **Dark Mode** | Full dark/light theme toggle |
| **Onboarding** | First-login preferences (Pomodoro durations, timezone, theme) |

---

## Data Export

Export your data at any time via the API (JWT token required):

| Endpoint | Description |
|---|---|
| `GET /api/export/tasks` | All tasks |
| `GET /api/export/sessions` | All Pomodoro sessions |
| `GET /api/export/blocks` | All calendar time blocks |
| `GET /api/export/all` | Complete data dump (JSON only) |

**Supported formats:** `json` (default) and `csv`

**Optional filters:**

```
?format=csv
?from_date=2026-01-01&to_date=2026-12-31
?category=backend        (tasks only)
```

**Examples:**

```bash
# All tasks as CSV
GET /api/export/tasks?format=csv

# Tasks filtered by date range and category
GET /api/export/tasks?format=json&from_date=2026-01-01&to_date=2026-12-31&category=backend

# All Pomodoro sessions as CSV
GET /api/export/sessions?format=csv

# Complete data dump
GET /api/export/all
```

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
| `DashboardPage.test.jsx` | 33 | Dashboard, analytics, auto-schedule, recurrence |
| `TimerContext.test.jsx` | 5 | Timer context + user preferences |
| `AuthContext.test.jsx` | 5 | Auth state + token validation |
| `TaskService.test.js` | 11 | Task CRUD service |
| `TimerPage.test.jsx` | 9 | Pomodoro timer component |
| `AuthPages.test.jsx` | 5 | Login / Register pages |
| `CalendarPage.test.jsx` | — | Calendar interactions + recurrence |
| `TasksPage.test.jsx` | — | Kanban board interactions |
| `LoginPage.test.jsx` | — | Login page |
| `RegisterPage.test.jsx` | — | Register page |
| `OnboardingPage.test.jsx` | — | Onboarding flow |
| `AuthService.test.js` | — | Auth service calls |
| `api.test.js` | — | Axios interceptors |
| `detectOverlap.test.js` | — | Overlap detection utility |
| `smartSchedule.test.js` | — | Smart scheduling utility |
| `smartCategories.test.js` | — | Category suggestion utility |

### Backend — pytest

```bash
# From the project root
pytest tests/ -v

# With coverage report
pytest tests/ -v --cov=app --cov-report=html
```

Test files in `tests/`:

| File | Tests | Coverage |
|---|---|---|
| `tests/backend/test_tasks.py` | 18 | Full task CRUD, analytics, error cases |
| `tests/backend/test_ai.py` | 12 | All AI endpoints, rate limiting, errors |
| `tests/backend/test_export.py` | 14 | Export endpoints, formats, filters, auth |
| `tests/test_calendar.py` | 12 | Calendar CRUD, scoped updates/deletes |
| `tests/backend/test_api.py` | 3 | Auth and task creation |
| `tests/backend/authentication/` | 8 files | Full auth flow |
| `tests/backend/test_comments.py` | — | Task comments |
| `tests/backend/test_sharing.py` | — | Task sharing |
| `tests/backend/test_workspaces.py` | — | Team workspaces |
| `tests/backend/test_activity.py` | — | Activity feed |
| `tests/backend/test_notifications.py` | — | Notifications + deadline scanner |
| `tests/backend/test_websocket.py` | — | WebSocket connections |

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
| `MONGODB_URL` | Production MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI key for server-side AI (optional) |
| `GEMINI_API_KEY` | Gemini key for server-side AI (optional) |

---

## Project Structure

```
focusflow/
├── .env.example                  ← copy to backend/.env and fill in values
├── docker-compose.yml
├── README.md
├── backend/
│   ├── .env                      ← your secrets (gitignored)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py               ← FastAPI entry point + WebSocket
│       ├── db.py                 ← MongoDB singleton connection
│       ├── auth.py               ← JWT + bcrypt utilities
│       ├── models.py             ← shared Pydantic schemas
│       ├── ws.py                 ← WebSocket connection manager
│       ├── authentication/       ← register, login, onboarding, password
│       ├── tasks/                ← task CRUD + analytics + recurrence
│       ├── comments/             ← task comments
│       ├── sharing/              ← task sharing between users
│       ├── workspaces/           ← team workspaces
│       ├── activity/             ← activity feed
│       ├── notifications/        ← deadline scanner + notifications
│       └── routers/
│           ├── timer.py          ← Pomodoro sessions + stats
│           ├── calendar.py       ← time blocks + bulk + scoped ops
│           ├── ai.py             ← AI endpoints (Strategy + Adapter pattern)
│           └── export.py         ← data export CSV / JSON
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── pages/                ← 12 pages
│       ├── components/           ← Layout, AITaskGenerator, CommentThread, etc.
│       ├── context/              ← Auth, Timer, Theme, Notification contexts
│       ├── services/             ← api.js, taskService, authService, sharingService
│       ├── utils/                ← detectOverlap, smartSchedule, smartCategories
│       └── tests/                ← 16 Jest test files
├── tests/
│   ├── backend/                  ← pytest test suites (22 files)
│   └── conftest.py
└── .github/
    └── workflows/
        └── ci.yml
```

---

## API Documentation

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

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
