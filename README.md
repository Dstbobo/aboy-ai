# Aboy AI

RAG-powered healthcare AI platform for medical, nursing, and allied health students.

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.12) |
| Database | Supabase (PostgreSQL + pgvector + Auth) |
| Embeddings | Voyage AI — voyage-3, 1024 dimensions |
| Web Search | Tavily — whitelisted medical domains only |
| LLM | Anthropic Claude Sonnet |
| Hosting | Railway (backend) |
| Mobile | React Native + Expo (Android APK first) |

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env          # fill in your API keys
pip install -e ".[dev]"
uvicorn app.main:app --reload  # http://localhost:8000
```

### 2. Seed the database

```bash
# First run 001_initial_schema.sql against your Supabase project, then:
python -m app.db.seeder
```

### 3. Mobile

```bash
cd mobile
cp .env.example .env.local    # fill in Supabase + API URL
npm install
npx expo start --android
```

### 4. Build APK

```bash
cd mobile
eas build --platform android --profile mvp
# Share APK via distribution/index.html (update the QR code and APK link after build)
```

## Project Structure

```
aboy-ai/
├── backend/           FastAPI backend
│   ├── app/
│   │   ├── api/v1/    Route handlers (thin)
│   │   ├── core/      RAG pipeline, LLM, auth, audit
│   │   ├── db/        Supabase client + migrations + seeder
│   │   ├── models/    Pydantic schemas
│   │   └── utils/     Emergency detection, rate limiting, citations
│   └── tests/
├── mobile/            React Native + Expo
│   ├── app/           Expo Router screens
│   ├── components/    Chat, shared UI
│   ├── stores/        Zustand state
│   ├── services/      API + Auth + Notifications
│   └── hooks/         Role, offline, streaming, streak
└── distribution/      APK download page (static HTML)
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /api/v1/me | Current user info |
| POST | /api/v1/query | RAG query (JSON response) |
| POST | /api/v1/query/stream | RAG query (SSE streaming) |
| GET | /api/v1/streak | Study streak stats |
| POST | /api/v1/feedback | Submit query feedback |
| POST | /api/v1/notifications/register | Register push token |
| GET | /api/v1/admin/users | List all users (admin) |
| PATCH | /api/v1/admin/users/{id}/role | Update user role (admin) |
| GET | /api/v1/admin/audit | Audit log (admin) |
| GET | /api/v1/admin/knowledge | List knowledge sources (admin) |
| POST | /api/v1/admin/knowledge | Add knowledge source (admin) |

## Environment Variables

### Backend (Railway)
```
SUPABASE_URL
SUPABASE_SERVICE_KEY
SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
VOYAGE_API_KEY
TAVILY_API_KEY
ENVIRONMENT
ALLOWED_ORIGINS
```

### Mobile (.env.local)
```
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

## Deploy

```bash
# Backend → Railway
# Push to GitHub → Railway auto-deploys from Dockerfile

# Mobile OTA update (no rebuild)
cd mobile
eas update --branch mvp --message "fix: description"
```

## Phase Status

- [x] **Phase 0** — Backend complete and deployable
- [x] **Phase 1** — Mobile app (login, register, chat, flashcards, streaks, admin)
- [ ] **Phase 2** — Spaced repetition, mock exams, analytics (after 100 students)
- [ ] **Phase 3** — Hospital operations layer (after Phase 2)
