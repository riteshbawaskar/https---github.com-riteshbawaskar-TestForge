"""Job status polling and SSE stream."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import get_job_repo
from app.db.repository import JobRepository
from app.db.session import AsyncSessionLocal
from app.models.models import GenerationJob
from app.schemas.schemas import JobRead

router = APIRouter()


@router.get("/{job_id}", response_model=JobRead)
async def get_job(job_id: str, repo: JobRepository = Depends(get_job_repo)):
    return await repo.get_or_raise(job_id)


@router.get("/{job_id}/stream")
async def stream_job(job_id: str):
    """Server-Sent Events stream — polls DB every 1.5 s until COMPLETE or FAILED."""

    async def generator():
        try:
            while True:
                async with AsyncSessionLocal() as db:
                    job = await db.get(GenerationJob, job_id)

                if job is None:
                    yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                    yield "event: done\ndata: {}\n\n"
                    break

                yield f"data: {json.dumps({'id': str(job.id), 'status': job.status, 'progress': job.progress_message, 'error': job.error_message})}\n\n"

                if job.status in ("COMPLETE", "FAILED"):
                    yield "event: done\ndata: {}\n\n"
                    break

                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            pass  # client disconnected

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
