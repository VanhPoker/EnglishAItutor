# English AI Tutor

AI Agent hỗ trợ giao tiếp tiếng Anh — Voice + Text, real-time conversation với error correction, adaptive learning, và long-term memory.

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| **Backend** | Python 3.11, FastAPI, LiveKit Agents, LangGraph, LangChain |
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, Framer Motion |
| **LLM** | Google Gemini 2.5 Flash (free) / Groq Llama 3.3 70B (free) |
| **Voice** | LiveKit (WebRTC), Silero VAD |
| **Memory** | mem0 + pgvector |
| **Database** | PostgreSQL 16 + pgvector |
| **Infra** | Docker Compose |

## Architecture

```
User (Browser)
  ├── Voice ──→ LiveKit Server ──→ Agent Worker ──→ LangGraph
  └── Text  ──→ LiveKit Text Stream ──→           ↗
                                                  ↓
                                    assess → route → respond / correct / topic
                                                  ↓
                                            save_memory (mem0 + pgvector)
                                                  ↓
                                    TTS ← Agent Response → Text Stream → Browser
```

## Project Structure

```
english-agent/
├── backend/
│   ├── app/
│   │   ├── main.py                    # LiveKit agent worker entry
│   │   ├── helper_api.py              # FastAPI server (token API)
│   │   ├── core/
│   │   │   ├── settings.py            # Pydantic config (.env)
│   │   │   ├── llm.py                 # Multi-provider LLM factory
│   │   │   └── langgraph_adapter.py   # LangGraph ↔ LiveKit bridge
│   │   ├── agents/english_tutor/
│   │   │   ├── entrypoint.py          # Agent session setup
│   │   │   ├── graph.py               # LangGraph state machine
│   │   │   ├── models.py              # State + structured output models
│   │   │   ├── prompts.py             # 6 English tutoring prompts
│   │   │   └── nodes/
│   │   │       ├── assess.py          # Error analysis + routing
│   │   │       ├── respond.py         # Natural conversation
│   │   │       ├── correct.py         # Friendly error correction
│   │   │       └── topic.py           # Topic management
│   │   ├── memory/client.py           # mem0 + pgvector client
│   │   ├── database/
│   │   │   ├── connection.py          # Async PostgreSQL pool
│   │   │   └── models.py             # User, PracticeSession, ErrorLog
│   │   ├── router/token.py            # LiveKit token endpoint
│   │   └── schema/models.py           # Provider & model enums
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/                     # Home, Practice, Dashboard
│   │   ├── components/
│   │   │   ├── chat/                  # ChatRoom, MessageList, InputBar
│   │   │   ├── voice/                 # AudioVisualizer, VoiceControls
│   │   │   └── feedback/             # CorrectionCard, ScoreDisplay
│   │   ├── hooks/                     # useLiveKit, useTranscript
│   │   ├── stores/                    # Zustand (chatStore, userStore)
│   │   └── lib/api.ts                 # API client
│   ├── package.json
│   └── vite.config.ts
└── docker-compose.yaml                # LiveKit + PostgreSQL + API + Agent
```

---

## Quick Start (Local Development)

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Docker & Docker Compose**
- **Google API Key** (free): https://aistudio.google.com/apikey

### 1. Clone

```bash
git clone https://github.com/VanhPoker/EnglishAItutor.git
cd EnglishAItutor
```

### 2. Backend setup

```bash
cd backend

# Copy env và điền API key
cp .env.example .env
# Mở .env → điền GOOGLE_API_KEY=your-key-here

# Tạo virtual environment
python -m venv .venv

# Activate (Linux/Mac)
source .venv/bin/activate
# Activate (Windows)
.venv\Scripts\activate

# Install dependencies
pip install -e .
```

### 3. Start infrastructure (Docker)

```bash
# Từ thư mục root (EnglishAItutor/)
docker compose up -d livekit postgres
```

Verify:
```bash
docker compose ps
# livekit   → 0.0.0.0:7880
# postgres  → 0.0.0.0:5432
```

### 4. Start backend

Mở 2 terminal:

```bash
# Terminal 1: FastAPI server
cd backend
uvicorn app.helper_api:app --host 0.0.0.0 --port 8080 --reload

# Terminal 2: LiveKit Agent worker
cd backend
python -m app.main dev
```

### 5. Start frontend

```bash
cd frontend
npm install
npm run dev
```

### 6. Open browser

Truy cập **http://localhost:5173**

1. Chọn CEFR level (A1-C2)
2. Chọn conversation topic
3. Click **Start Practicing**
4. Nói hoặc gõ tiếng Anh!

---

## Run on VM / Cloud Server

### Option A: Docker Compose (recommended)

```bash
# Clone repo
git clone https://github.com/VanhPoker/EnglishAItutor.git
cd EnglishAItutor

# Setup env
cp backend/.env.example backend/.env
nano backend/.env
# Điền: GOOGLE_API_KEY=your-key

# Build & run everything
docker compose up -d --build

# Check status
docker compose ps
docker compose logs -f agent
```

Services:
| Service | Port | URL |
|---------|------|-----|
| Frontend | 5173 | http://your-vm-ip:5173 |
| API | 8080 | http://your-vm-ip:8080 |
| LiveKit | 7880 | ws://your-vm-ip:7880 |
| PostgreSQL | 5432 | Internal |

### Option B: Manual setup on VM

```bash
# 1. Install dependencies
sudo apt update
sudo apt install -y python3.11 python3.11-venv nodejs npm docker.io docker-compose-v2

# 2. Clone & setup
git clone https://github.com/VanhPoker/EnglishAItutor.git
cd EnglishAItutor
cp backend/.env.example backend/.env
# Edit .env with your API keys

# 3. Start infra
docker compose up -d livekit postgres

# 4. Backend
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .

# Start in background with tmux
tmux new -s api
uvicorn app.helper_api:app --host 0.0.0.0 --port 8080
# Ctrl+B, D to detach

tmux new -s agent
python -m app.main dev
# Ctrl+B, D to detach

# 5. Frontend
cd ../frontend
npm install
npm run build          # Production build → dist/
npx serve dist -l 5173 # Serve static files
```

### Option C: VM with HTTPS (production-like)

Thêm Nginx reverse proxy:

```nginx
# /etc/nginx/sites-available/english-tutor
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5173;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
    }

    location /ws {
        proxy_pass http://localhost:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/english-tutor /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
sudo systemctl restart nginx
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_API_KEY` | Yes* | — | Google AI Studio API key (Gemini) |
| `GROQ_API_KEY` | Alt* | — | Groq API key (fallback LLM) |
| `LIVEKIT_API_KEY` | Yes | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | `secret` | LiveKit API secret |
| `LIVEKIT_URL` | Yes | `ws://localhost:7880` | LiveKit server URL |
| `POSTGRES_SERVER` | Yes | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | Yes | `5432` | PostgreSQL port |
| `POSTGRES_DB` | Yes | `english_agent` | Database name |
| `POSTGRES_USER` | Yes | `postgres` | DB username |
| `POSTGRES_PASSWORD` | Yes | `postgres` | DB password |

*At least one LLM API key required (`GOOGLE_API_KEY` or `GROQ_API_KEY`).

Free API keys:
- **Google Gemini**: https://aistudio.google.com/apikey (1500 req/day free)
- **Groq**: https://console.groq.com/keys (free tier)

---

## Development Guide

### Add a new LangGraph node

1. Create `backend/app/agents/english_tutor/nodes/your_node.py`:
```python
from langchain_core.messages import AIMessage
from langchain_core.runnables.config import RunnableConfig
from app.agents.english_tutor.models import EnglishTutorState

async def your_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    # Process state, call LLM, return updates
    return {"messages": [AIMessage(content="...")]}
```

2. Register in `graph.py`:
```python
builder.add_node("your_node", your_node)
builder.add_edge("your_node", "save_memory")
```

3. Update routing in `route_after_assess()` if needed.

### Add a new API endpoint

1. Create `backend/app/router/your_router.py`
2. Register in `helper_api.py`:
```python
from app.router.your_router import router as your_router
app.include_router(your_router, prefix="/api")
```

### Add a new frontend page

1. Create `frontend/src/pages/YourPage.tsx`
2. Add route in `App.tsx`:
```tsx
<Route path="/your-page" element={<YourPage />} />
```
3. Add nav link in `components/ui/Layout.tsx`

### Database migrations

```bash
cd backend
alembic init alembic
# Edit alembic/env.py → import app.database.models.Base
alembic revision --autogenerate -m "description"
alembic upgrade head
```

---

## Testing

### Backend

```bash
cd backend

# Test all imports
python -c "
import os; os.environ['GOOGLE_API_KEY']='test'
os.environ['LIVEKIT_API_KEY']='devkey'; os.environ['LIVEKIT_API_SECRET']='secret'
from app.core.langgraph_adapter import LangGraphAdapter
from app.agents.english_tutor.graph import create_english_tutor_graph
from app.router.token import router
from app.database.models import User, PracticeSession, ErrorLog
print('ALL IMPORTS OK')
"

# Test API endpoints
python -c "
import os; os.environ['GOOGLE_API_KEY']='test'
os.environ['LIVEKIT_API_KEY']='devkey'; os.environ['LIVEKIT_API_SECRET']='secret'
from fastapi.testclient import TestClient
from app.helper_api import app
c = TestClient(app)
assert c.get('/health').status_code == 200
assert c.post('/api/token', json={'userId':'u1','userName':'Test'}).status_code == 200
print('API TESTS PASS')
"

# Test graph compilation
python -c "
import asyncio, os; os.environ['GOOGLE_API_KEY']='test'
os.environ['LIVEKIT_API_KEY']='devkey'; os.environ['LIVEKIT_API_SECRET']='secret'
from app.agents.english_tutor.graph import create_english_tutor_graph
g = asyncio.run(create_english_tutor_graph(use_checkpointer=False))
print('Graph nodes:', list(g.nodes.keys()))
"
```

### Frontend

```bash
cd frontend
npx tsc --noEmit      # TypeScript check
npm run build          # Production build
```

### End-to-end

1. Start all services (docker + backend + frontend)
2. Open http://localhost:5173
3. Click **Start Practicing**
4. Test voice: click mic, speak English
5. Test text: type a message with grammar errors
6. Verify: agent responds and corrects errors naturally

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError` | `pip install -e .` trong `backend/` |
| `No pq wrapper available` | `pip install "psycopg[binary]"` |
| LiveKit connection refused | `docker compose ps` — check LiveKit port 7880 |
| Token endpoint 500 | Check `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` trong `.env` |
| Gemini quota exceeded | Thêm `GROQ_API_KEY` vào `.env` làm backup |
| Frontend proxy error | Ensure backend chạy ở port 8080 |

---

## Cost

| Component | Cost |
|-----------|------|
| Google Gemini 2.5 Flash | Free (1500 req/day) |
| Groq Llama 3.3 70B | Free tier |
| LiveKit (self-hosted) | Free |
| PostgreSQL + pgvector | Free (Docker) |
| **Total** | **$0** |

---

## License

MIT
