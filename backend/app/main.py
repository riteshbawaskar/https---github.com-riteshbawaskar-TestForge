"""TestForge FastAPI application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text

from app.api.routes import documents, jobs, projects, requirements, testcases
from app.core.config import settings
from app.core.exceptions import NotFoundError, TestForgeError
from app.db.session import Base, engine

logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger(__name__)


async def _ensure_project_usage_columns(conn) -> None:
    columns = await conn.run_sync(lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("projects")})
    additions = {
        "llm_requests": "ALTER TABLE projects ADD COLUMN llm_requests INTEGER NOT NULL DEFAULT 0",
        "llm_input_tokens": "ALTER TABLE projects ADD COLUMN llm_input_tokens INTEGER NOT NULL DEFAULT 0",
        "llm_output_tokens": "ALTER TABLE projects ADD COLUMN llm_output_tokens INTEGER NOT NULL DEFAULT 0",
        "llm_cost_usd": "ALTER TABLE projects ADD COLUMN llm_cost_usd FLOAT NOT NULL DEFAULT 0",
        "embedding_requests": "ALTER TABLE projects ADD COLUMN embedding_requests INTEGER NOT NULL DEFAULT 0",
        "embedding_tokens": "ALTER TABLE projects ADD COLUMN embedding_tokens INTEGER NOT NULL DEFAULT 0",
        "embedding_cost_usd": "ALTER TABLE projects ADD COLUMN embedding_cost_usd FLOAT NOT NULL DEFAULT 0",
    }
    for name, ddl in additions.items():
        if name not in columns:
            await conn.execute(text(ddl))
            log.info("Added projects.%s column", name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(f"Starting TestForge — env={settings.ENVIRONMENT} db={settings.DATABASE_URL}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_project_usage_columns(conn)
    log.info("Database tables ready")
    yield
    await engine.dispose()
    log.info("Shutdown complete")


app = FastAPI(
    title="TestForge API",
    description="AI-powered test case generation from GitLab requirements",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(NotFoundError)
async def not_found(request: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(TestForgeError)
async def domain_error(request: Request, exc: TestForgeError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception(f"Unhandled error on {request.url.path}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(projects.router,     prefix="/api/v1/projects",     tags=["Projects"])
app.include_router(documents.router,    prefix="/api/v1/documents",    tags=["Documents"])
app.include_router(requirements.router, prefix="/api/v1/requirements", tags=["Requirements"])
app.include_router(testcases.router,    prefix="/api/v1/testcases",    tags=["Test Cases"])
app.include_router(jobs.router,         prefix="/api/v1/jobs",         tags=["Jobs"])


@app.get("/health", tags=["Infra"])
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/ready", tags=["Infra"])
async def ready():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not ready", "error": str(exc)})
