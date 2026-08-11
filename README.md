# LaCuoca 🍴

A Progressive Web App (PWA) for storing, scanning, and discovering cooking recipes — built for family and friends, designed to feel great on iPhone and Android.

---

## Features

- **Recipe management** — add, edit, delete, and browse recipes with ingredients, steps, timings, and photos
- **OCR scanning** — take a photo of any recipe page (English or German) and the app extracts ingredients and steps automatically
- **AI assistant** — chat with an AI chef, search recipes by natural language, or generate new recipes from a description
- **Unit conversion** — each user picks their preferred unit system (metric or imperial); all recipe quantities are converted on the fly
- **Recipe sharing** — share any recipe with another user as read-only or with edit access
- **Authentication** — username/password login with optional TOTP two-factor auth (RFC 6238, works with Google Authenticator, Authy, etc.)
- **Admin panel** — create users, reset passwords, activate/deactivate accounts, approve signup requests
- **PWA** — installs on iPhone and Android home screens, works offline for previously-viewed recipes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, Framer Motion, Zustand, React Query |
| Backend | FastAPI (Python 3.12), SQLAlchemy 2 async, Alembic |
| Database | PostgreSQL 16 + pgvector (for AI semantic search) |
| Cache | Redis 7 |
| OCR | Tesseract (English + German) via pytesseract |
| AI / RAG | Langchain + Ollama (local, default) or OpenAI |
| Auth | JWT + pyotp (TOTP) |
| Containers | Docker + Docker Compose |

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose (v2)
- `openssl` (pre-installed on macOS/Linux — used to generate secrets)
- ~4 GB free disk space (for the Ollama model download on first run)

### 1. Clone and set up

```bash
git clone <repo-url> lacuoca
cd lacuoca
bash scripts/setup_dev.sh
```

The setup script will:
1. Copy `.env.example` → `.env` and fill in random secret keys
2. Build all Docker images
3. Start all services (PostgreSQL, Redis, Ollama, backend, frontend)
4. Run database migrations and seed the admin user
5. Pull the default Ollama LLM model (~2 GB on first run)
6. Print the local network URL so you can open the app on your phone

### 2. Open the app

After setup completes, the script prints URLs like:

```
📱 App (frontend):   http://localhost:5173
🔧 API (backend):    http://localhost:8000
📖 API docs:         http://localhost:8000/api/docs

📡 On your local network (for phones):
   http://192.168.x.x:5173

🔑 Admin login:  admin / ChangeMe123!
```

Open `http://localhost:5173` in your browser, or the local network URL on any phone connected to the same Wi-Fi.

> **Change the admin password** — edit `ADMIN_PASSWORD` in `.env`, then run `bash scripts/reset_dev.sh`.

---

## Configuration

All configuration lives in `.env`. Copy the example file to get started:

```bash
cp .env.example .env
```

### Key settings

| Variable | Default | Description |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | Initial admin username |
| `ADMIN_PASSWORD` | `ChangeMe123!` | Initial admin password — **change this** |
| `AI_PROVIDER` | `ollama` | `ollama` (local) or `openai` |
| `OLLAMA_MODEL` | `llama3.2` | Any model available in your Ollama instance |
| `OPENAI_API_KEY` | — | Required when `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model name |
| `APP_ALLOWED_ORIGINS` | `http://localhost:5173,...` | Add your local IP if accessing from phones |

### Using OpenAI instead of Ollama

```bash
# In .env:
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Then restart the backend:

```bash
docker compose restart backend
```

---

## Scripts

| Script | Description |
|---|---|
| `bash scripts/setup_dev.sh` | First-time setup — builds images, starts services, seeds DB |
| `bash scripts/reset_dev.sh` | **Destructive** — wipes all data and starts fresh |

---

## Architecture

```
lacuoca/
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── main.py             # App entry point, CORS, static files
│   │   ├── config.py           # Settings (reads from .env)
│   │   ├── database.py         # Async SQLAlchemy engine + session
│   │   ├── seed.py             # Creates admin user on first start
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── user.py         # User, SignupRequest
│   │   │   ├── recipe.py       # Recipe, Ingredient, Step
│   │   │   └── sharing.py      # RecipeShare
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── api/v1/             # API endpoints
│   │   │   ├── auth.py         # Login, refresh, TOTP, password reset
│   │   │   ├── users.py        # User CRUD, signup requests (admin)
│   │   │   ├── recipes.py      # Recipe CRUD, image upload, sharing
│   │   │   ├── ocr.py          # Photo → structured recipe data
│   │   │   └── ai.py           # Semantic search, generate, chat
│   │   ├── core/
│   │   │   └── security.py     # Password hashing, JWT, TOTP helpers
│   │   └── services/
│   │       ├── ai_service.py   # Langchain RAG pipeline, LLM calls
│   │       ├── ocr_service.py  # Tesseract + heuristic parser
│   │       └── unit_converter.py  # Pint-based metric ↔ imperial
│   ├── alembic/                # Database migrations
│   │   └── versions/0001_initial.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   # React PWA
│   ├── src/
│   │   ├── App.tsx             # Router + auth guards
│   │   ├── store/authStore.ts  # Zustand auth state (persisted)
│   │   ├── utils/api.ts        # Axios client + all API calls
│   │   ├── types/index.ts      # Shared TypeScript types
│   │   ├── components/
│   │   │   ├── layout/         # Navbar, BottomNav, AppLayout
│   │   │   ├── recipes/        # RecipeCard, OCRCapture
│   │   │   └── ui/             # LoadingSpinner
│   │   └── pages/
│   │       ├── LoginPage.tsx   # Sign-in + TOTP + signup request
│   │       ├── DashboardPage.tsx  # Recipe list, search, AI search
│   │       ├── RecipeDetailPage.tsx  # View, share, cook mode (tap steps)
│   │       ├── RecipeCreatePage.tsx  # Manual + OCR scan + AI generate
│   │       ├── RecipeEditPage.tsx    # Edit recipe
│   │       ├── AIChatPage.tsx  # Chat with AI chef
│   │       ├── ProfilePage.tsx # Unit prefs, 2FA, logout
│   │       └── AdminPage.tsx   # User management
│   ├── vite.config.ts          # Vite + PWA plugin config
│   ├── tailwind.config.js
│   └── Dockerfile
│
├── scripts/
│   ├── setup_dev.sh            # One-time dev environment setup
│   └── reset_dev.sh            # Wipe and restart (development only)
│
├── docker-compose.yml          # All services: db, redis, ollama, backend, frontend
├── .env.example                # Environment variable template
└── .gitignore
```

---

## API Reference

Interactive docs are available at `http://localhost:8000/api/docs` when the backend is running.

### Authentication

All endpoints (except `POST /api/v1/auth/login` and `POST /api/v1/users/signup-request`) require a Bearer token.

```
Authorization: Bearer <access_token>
```

### Main endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Login (returns JWT tokens) |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/totp/setup` | Begin 2FA setup (returns QR code) |
| `POST` | `/api/v1/auth/totp/verify` | Confirm and enable 2FA |
| `POST` | `/api/v1/auth/totp/disable` | Disable 2FA |
| `POST` | `/api/v1/auth/reset-password` | Admin: reset a user's password |
| `GET` | `/api/v1/users/me` | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Update preferences (unit system, language) |
| `GET` | `/api/v1/users/` | Admin: list all users |
| `POST` | `/api/v1/users/` | Admin: create a user |
| `POST` | `/api/v1/users/signup-request` | Public: request an account |
| `GET` | `/api/v1/recipes/` | List recipes (supports `?search=` and `?category=`) |
| `POST` | `/api/v1/recipes/` | Create a recipe |
| `GET` | `/api/v1/recipes/{id}` | Get recipe (auto-converts units, supports `?unit_system=`) |
| `PATCH` | `/api/v1/recipes/{id}` | Update recipe |
| `DELETE` | `/api/v1/recipes/{id}` | Delete recipe |
| `POST` | `/api/v1/recipes/{id}/image` | Upload recipe photo |
| `POST` | `/api/v1/recipes/{id}/share` | Share with another user |
| `POST` | `/api/v1/ocr/extract` | Upload a photo, get extracted recipe data |
| `POST` | `/api/v1/ai/search` | Semantic recipe search |
| `POST` | `/api/v1/ai/generate` | Generate a recipe from a description |
| `POST` | `/api/v1/ai/chat` | Chat with the AI chef |

---

## Adding Users

Users cannot self-register. There are two ways to add a user:

1. **Admin panel** — sign in as admin, go to the Admin tab, and click "Add New User"
2. **Signup request** — on the login screen, switch to "Request Access" and fill in the form; an admin will see the request in the Admin panel and can approve it (then create the account manually)

---

## Installing as an App (PWA)

**iPhone (Safari):**
1. Open the app URL in Safari
2. Tap the Share button → "Add to Home Screen"

**Android (Chrome):**
1. Open the app URL in Chrome
2. Tap the three-dot menu → "Add to Home screen" (or Chrome will prompt automatically)

---

## Development Tips

### View logs

```bash
docker compose logs -f backend     # backend logs
docker compose logs -f frontend    # frontend logs (Vite HMR)
docker compose logs -f ollama      # AI model logs
```

### Run a manual database migration

```bash
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head
```

### Access the database directly

```bash
docker compose exec db psql -U lacuoca lacuoca
```

### Pull a different Ollama model

```bash
docker compose exec ollama ollama pull mistral
# Then update OLLAMA_MODEL=mistral in .env and restart the backend
docker compose restart backend
```

### Stop all services

```bash
docker compose down
```

---

## License

See [LICENSE](LICENSE).
