"""TestForge FastAPI application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import documents, jobs, projects, requirements, testcases
from app.core.config import settings
from app.core.exceptions import NotFoundError, TestForgeError
from app.db.session import Base, engine

logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(f"Starting TestForge — env={settings.ENVIRONMENT} db={settings.DATABASE_URL}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
    from sqlalchemy import text
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not ready", "error": str(exc)})
