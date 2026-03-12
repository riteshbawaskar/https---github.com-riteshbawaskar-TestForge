# TestForge Backend — Node.js

AI-powered test case generation from GitLab requirements.
Complete Node.js port of the Python/FastAPI backend with identical API surface.

## Stack

| Layer       | Python (original)       | Node.js (this)            |
|-------------|-------------------------|---------------------------|
| HTTP        | FastAPI + uvicorn       | Express 4                 |
| DB          | SQLAlchemy + aiosqlite  | better-sqlite3 (sync)     |
| LLM         | anthropic / openai / google-generativeai | @anthropic-ai/sdk / openai / @google/generative-ai |
| Embeddings  | openai / google / sentence-transformers | openai / @google/generative-ai / @xenova/transformers |
| Vector DB   | qdrant-client (Python)  | @qdrant/js-client-rest    |
| File parse  | pypdf / python-docx / openpyxl | pdf-parse / mammoth / xlsx |
| Background  | asyncio.create_task     | setImmediate (async)      |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env — set at least one LLM API key

# 3. Start Qdrant (required for document indexing)
docker run -p 6333:6333 qdrant/qdrant

# 4. Run
npm run dev          # development (auto-restart on changes)
npm start            # production
```

The server starts on http://localhost:8000 by default.

## Embedding provider options

Set `EMBEDDING_PROVIDER` in `.env`:

| Provider | Key needed | Quality | Speed | Notes |
|----------|-----------|---------|-------|-------|
| `openai` (default) | OPENAI_API_KEY | ★★★★★ | Fast | $0.02/M tokens |
| `gemini` | GEMINI_API_KEY | ★★★★☆ | Fast | Free tier available |
| `local`  | None | ★★★☆☆ | Slower | `npm install @xenova/transformers` |

> **Note:** Qdrant stores vectors per collection with a fixed dimension.
> If you switch providers, delete the old Qdrant data or create a new project.

## API endpoints

Identical to the Python backend — the React frontend works without changes.

```
GET  /health
GET  /ready

# Projects
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
PUT    /api/v1/projects/:id
DELETE /api/v1/projects/:id
POST   /api/v1/projects/:id/test-connection

# Documents
POST   /api/v1/documents/:projectId/upload    (multipart/form-data, field: file)
GET    /api/v1/documents/:projectId
GET    /api/v1/documents/:projectId/stats
DELETE /api/v1/documents/:documentId

# Requirements
POST   /api/v1/requirements/fetch
POST   /api/v1/requirements/bulk-fetch/:projectId
GET    /api/v1/requirements/project/:projectId
GET    /api/v1/requirements/:id
DELETE /api/v1/requirements/:id

# Test Cases
POST   /api/v1/testcases/generate
GET    /api/v1/testcases/requirement/:requirementId
GET    /api/v1/testcases/:id
PATCH  /api/v1/testcases/:id
DELETE /api/v1/testcases/:id
POST   /api/v1/testcases/export

# Jobs
GET    /api/v1/jobs/:id
GET    /api/v1/jobs/:id/stream     (SSE)
```

## File structure

```
backend-node/
├── .env.example
├── package.json
└── src/
    ├── server.js              # Express app entry point
    ├── config.js              # All env vars in one place
    ├── security.js            # XOR+base64 token encryption
    ├── db/
    │   └── database.js        # better-sqlite3 + migrations
    ├── middleware/
    │   └── errorHandler.js
    ├── routes/
    │   ├── projects.js
    │   ├── documents.js
    │   ├── requirements.js
    │   ├── testcases.js
    │   └── jobs.js
    └── services/
        ├── embedding.js       # Multi-provider: openai | gemini | local
        ├── vectordb.js        # Qdrant client wrapper
        ├── document.js        # Parse → chunk → embed → store
        ├── llm.js             # Test case generation + RAG
        ├── gitlab.js          # GitLab REST API client
        └── jobs.js            # Background task runners
```
