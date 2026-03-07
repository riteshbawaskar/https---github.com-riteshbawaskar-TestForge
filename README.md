# TestForge — AI Test Case Designer

Generate BDD and manual test cases from GitLab requirements using LLMs + RAG.

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, OPENAI_API_KEY, ENCRYPTION_KEY

# 2. Start all services
docker compose up --build

# 3. App is live
#    Frontend:  http://localhost:5173
#    API:       http://localhost:8000
#    API Docs:  http://localhost:8000/docs
```

## Architecture

```
testforge/
├── backend/                    # FastAPI + Celery
│   └── app/
│       ├── main.py             # FastAPI entry point
│       ├── core/
│       │   ├── config.py       # Pydantic Settings (reads .env)
│       │   ├── logging.py      # Structured logging (structlog)
│       │   └── security.py     # Fernet encryption for GitLab tokens
│       ├── db/
│       │   └── session.py      # Async SQLAlchemy engine + Base
│       ├── models/
│       │   └── project.py      # ORM models: Project, Document, Requirement, TestCase, GenerationJob
│       ├── schemas/
│       │   └── project.py      # Pydantic request/response schemas
│       ├── services/
│       │   ├── gitlab_service.py      # python-gitlab: fetch issues
│       │   ├── document_service.py    # Unstructured → chunk → ChromaDB
│       │   └── generation_service.py # LangChain + Anthropic/OpenAI + RAG
│       ├── workers/
│       │   ├── celery_app.py   # Celery config
│       │   └── tasks.py        # generate_test_cases_task, index_document_task
│       └── api/routes/
│           ├── projects.py     # CRUD + test-connection
│           ├── documents.py    # Upload + list
│           ├── requirements.py # Fetch from GitLab + list
│           ├── testcases.py    # Generate trigger + CRUD
│           └── jobs.py         # Job status + SSE stream
│
├── frontend/                   # React + TypeScript + Vite
│   └── src/
│       ├── api/                # Axios API clients per resource
│       ├── components/
│       │   ├── layout/         # Sidebar, Layout shell
│       │   ├── config/         # ProjectConfigForm
│       │   ├── documents/      # DropZone, DocumentList
│       │   ├── design/         # RequirementPanel, TestCasePanel, GherkinEditor
│       │   └── shared/         # Button, Badge, Card, Modal, Toast
│       ├── hooks/
│       │   └── useJobPoller.ts # SSE hook for generation progress
│       ├── pages/              # DashboardPage, ConfigPage, DocumentsPage, DesignPage
│       ├── store/
│       │   └── useProjectStore.ts  # Zustand: active project state
│       ├── types/index.ts      # TypeScript interfaces
│       └── utils/
│           └── export.ts       # Word (docx) + Excel (SheetJS) export
│
├── docker-compose.yml          # api, worker, frontend, db, redis (vector store is local FAISS)
└── .env.example
```

## Key Flows

### 1. Generate Test Cases
```
User pastes GitLab URL → POST /requirements/fetch → GitLab API → Requirement saved
User clicks Generate   → POST /testcases/generate → GenerationJob created
                       → Celery task queued
Celery worker:
  1. Fetch requirement from DB
1. retrieve_context() → FAISS similarity search → top-5 chunks
  3. build_user_prompt() → requirement + context
  4. Call Anthropic/OpenAI API → JSON test cases
  5. Parse + save TestCase rows
Frontend SSE stream    → GET /jobs/{id}/stream → real-time progress
On complete            → TanStack Query refetch → test cases appear
```

### 2. Document Indexing
```
User uploads file → POST /documents/{project_id}/upload → saved to disk
                  → index_document_task queued (Celery)
Celery worker:
  1. partition(file) via Unstructured → raw text
  2. RecursiveCharacterTextSplitter → ~500-token chunks
  3. OpenAI text-embedding-3-small → embeddings
  4. FAISS index upsert
  5. Document.status = "INDEXED", chunk_count updated
```

### 3. Client-side Export
```
User clicks Export → exportToWord() or exportToExcel()
  Word:  docx npm package → Blob → download
  Excel: SheetJS          → .xlsx → download
No server round-trip needed.
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENAI_API_KEY` | Yes | For embeddings (text-embedding-3-small) |
| `DATABASE_URL` | Yes | PostgreSQL async URL |
| `REDIS_URL` | Yes | Redis for Celery broker + backend |
| `VECTOR_STORE_PATH` | Yes | Filesystem directory for FAISS indexes |
| `ENCRYPTION_KEY` | Yes | Fernet key to encrypt GitLab tokens at rest |
| `SECRET_KEY` | Yes | App secret |
| `DEFAULT_LLM_MODEL` | No | Default: claude-sonnet-4-6 |

## Development (without Docker)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Worker (separate terminal)
celery -A app.workers.celery_app worker --loglevel=info

# Frontend
cd frontend
npm install
npm run dev
```
