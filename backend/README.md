# TestForge Backend

FastAPI · SQLite · Qdrant · Anthropic/OpenAI · No Celery, no Redis

## Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and/or OPENAI_API_KEY

# 3. Start Qdrant (for document indexing / RAG)
docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant

# 4. Run the API
uvicorn app.main:app --reload --port 8000

# API docs: http://localhost:8000/docs
```

## Architecture

| Component    | Choice                                  |
|--------------|-----------------------------------------|
| Web API      | FastAPI + uvicorn                       |
| Database     | SQLite via aiosqlite (no server needed) |
| Task queue   | `asyncio.create_task()` (no broker)    |
| Vector store | Qdrant (single Docker container)        |
| Embeddings   | OpenAI text-embedding-3-small           |
| LLM          | Anthropic Claude or OpenAI GPT          |
| Encryption   | XOR + base64 (swap for Fernet in prod)  |

## Multi-project support

Each project has its own:
- Row in the `projects` table with independent GitLab + LLM config
- Qdrant collection `project_<uuid>` for document vectors
- Cascading `documents`, `requirements`, `test_cases`, `generation_jobs`

Deleting a project removes all associated data automatically.

## Running tests

```bash
pytest tests/ -v
```
