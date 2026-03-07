"""Background tasks — plain asyncio, no Celery or Redis needed.

Tasks are launched with `asyncio.create_task()` from the route handlers.
Job status is updated in the DB so the SSE stream can report progress.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime

log = logging.getLogger(__name__)


async def run_generate_test_cases(
    job_id: str,
    requirement_id: str,
    project_id: str,
    fmt: str,
    count_hint: str,
    additional_context: str,
) -> None:
    """Async background task: generate test cases and persist them."""
    from app.db.session import AsyncSessionLocal
    from app.models.models import GenerationJob, Project, Requirement, TestCase
    from app.services.generation_service import generate_test_cases
    from app.core.exceptions import LLMError, DocumentIngestionError

    async with AsyncSessionLocal() as db:
        job = await db.get(GenerationJob, job_id)
        if not job:
            log.error(f"job_not_found job_id={job_id}")
            return

        async def _update(status: str, msg: str, error: str = ""):
            job.status           = status
            job.progress_message = msg
            if error:
                job.error_message = error
            if status in ("COMPLETE", "FAILED"):
                job.completed_at = datetime.utcnow()
            await db.commit()

        await _update("RUNNING", "Fetching requirement details…")

        try:
            req     = await db.get(Requirement, requirement_id)
            project = await db.get(Project, project_id)
            if not req or not project:
                await _update("FAILED", "Not found", "Requirement or Project not found")
                return

            await _update("RUNNING", "Retrieving document context…")
            # Small yield so the event loop can flush the commit
            await asyncio.sleep(0)

            req_dict = {
                "title":       req.title,
                "description": req.description or "",
                "labels":      req.labels or "",
            }

            await _update("RUNNING", f"Calling {project.llm_model}…")
            await asyncio.sleep(0)

            # Generation is CPU/IO bound (blocking HTTP) — run in thread executor
            loop  = asyncio.get_event_loop()
            cases = await loop.run_in_executor(
                None,
                lambda: generate_test_cases(
                    requirement=req_dict,
                    project_id=project_id,
                    fmt=fmt,
                    count_hint=count_hint,
                    additional_context=additional_context,
                    llm_provider=project.llm_provider,
                    llm_model=project.llm_model,
                    custom_instructions=project.custom_instructions or "",
                ),
            )

            await _update("RUNNING", f"Saving {len(cases)} test cases…")

            rows = []
            for tc in cases:
                content = tc.get("content", "")
                if isinstance(content, dict):
                    content = json.dumps(content, indent=2)
                tc_fmt = tc.get("format", fmt)
                if tc_fmt == "BOTH":
                    tc_fmt = "BDD"
                rows.append(TestCase(
                    id=str(uuid.uuid4()),
                    requirement_id=requirement_id,
                    title=tc.get("title", "Untitled"),
                    format=tc_fmt,
                    content=content,
                    priority=tc.get("priority", "MEDIUM"),
                    tags=tc.get("tags", ""),
                    scenario_type=tc.get("scenario_type", "positive"),
                ))

            db.add_all(rows)
            await db.commit()
            await _update("COMPLETE", f"Generated {len(rows)} test cases")
            log.info(f"generation_complete job={job_id} count={len(rows)}")

        except (LLMError, DocumentIngestionError) as exc:
            log.error(f"generation_failed job={job_id} error={exc}")
            await _update("FAILED", "Generation failed", str(exc))

        except Exception as exc:
            log.exception(f"generation_unexpected job={job_id}")
            await _update("FAILED", "Unexpected error", str(exc))


async def run_index_document(
    document_id: str,
    file_path: str,
    project_id: str,
) -> None:
    """Async background task: parse and index a document into Qdrant."""
    from app.db.session import AsyncSessionLocal
    from app.models.models import Document
    from app.services.document_service import ingest_document
    from app.core.exceptions import DocumentIngestionError

    async with AsyncSessionLocal() as db:
        doc = await db.get(Document, document_id)
        if not doc:
            log.error(f"document_not_found doc_id={document_id}")
            return

        doc.status = "INDEXING"
        await db.commit()

        try:
            loop = asyncio.get_event_loop()
            chunk_count = await loop.run_in_executor(
                None,
                lambda: ingest_document(file_path, project_id, document_id),
            )
            doc.chunk_count = chunk_count
            doc.status      = "INDEXED"
            await db.commit()
            log.info(f"document_indexed doc_id={document_id} chunks={chunk_count}")

        except (DocumentIngestionError, Exception) as exc:
            log.error(f"indexing_failed doc_id={document_id} error={exc}")
            doc.status        = "FAILED"
            doc.error_message = str(exc)
            await db.commit()
