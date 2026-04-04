# Installation & Deployment

## Prerequisites

Before running FocusFlow, make sure you have the following installed:

| Tool | Version | Download |
|---|---|---|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| Git | Any | https://git-scm.com/ |
| Node.js (optional, local dev only) | 18+ | https://nodejs.org/ |
| Python (optional, local dev only) | 3.11+ | https://python.org/ |

You will also need:
- A **MongoDB** instance — either local or [MongoDB Atlas free tier](https://www.mongodb.com/cloud/atlas)
- A **Gemini API key** (optional, for AI features) — get one free at https://aistudio.google.com/app/apikey

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/gaurav-bakale/focusflow.git
cd focusflow
```

---

## Step 2 — Configure Environment Variables

```bash
cp .env.example backend/.env
```

Open `backend/.env` and fill in the required values:

```env
# Required
MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/focusflow?retryWrites=true&w=majority
JWT_SECRET=your-long-random-secret-here

# Optional — AI features work even without these (users can add their own key in Settings)
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

> **Tip:** Generate a JWT secret with:
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

> **Never commit** `backend/.env` to version control — it is in `.gitignore`.

---

## Step 3 — Build and Start with Docker

```bash
docker-compose up --build
```

This starts three containers:
| Container | Port | Description |
|---|---|---|
| `focusflow_frontend` | 3001 | React app (Nginx) |
| `focusflow_backend` | 8000 | FastAPI server |
| `focusflow_mongo` | 27017 | MongoDB (if using local DB) |

Once running, open:
- **App:** http://localhost:3001
- **API Swagger:** http://localhost:8000/docs
- **API ReDoc:** http://localhost:8000/redoc

---

## Step 4 — Create Your Account

1. Navigate to http://localhost:3001
2. Click **Register**
3. Fill in your name, email, and a password meeting the requirements:
   - Minimum 8 characters
   - At least 1 uppercase letter
   - At least 1 number
   - At least 1 special character (e.g. `!@#$%`)
   - Example: `MyPass@123`
4. Complete the **Onboarding** flow — set your Pomodoro durations and timezone
5. You're in!

---

## Stopping the App

```bash
docker-compose down
```

To also remove all data volumes:
```bash
docker-compose down -v
```

---

## Local Development (Without Docker)

### Frontend

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
```

---

## Running Tests

### Frontend (Jest)
```bash
cd frontend
npm run test:coverage
```

### Backend (pytest)
```bash
pytest tests/ -v --cov=app --cov-report=html
```
