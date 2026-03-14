"""Document upload, listing, deletion, stats."""
from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_document_repo, get_project_repo
from app.core.config import settings
from app.db.repository import DocumentRepository, ProjectRepository
from app.db.session import get_db
from app.schemas.schemas import DocumentRead, DocumentStats
from app.services.document_service import delete_document_vectors, get_index_stats
from app.workers.tasks import run_index_document

router = APIRouter()


def _ext(filename: str) -> str:
    return Path(filename).suffix.lstrip(".").lower()


@router.post("/{project_id}/upload", response_model=DocumentRead, status_code=201)
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    doc_repo: DocumentRepository = Depends(get_document_repo),
    proj_repo: ProjectRepository = Depends(get_project_repo),
    db: AsyncSession = Depends(get_db),
):
    await proj_repo.get_or_raise(project_id)

    ext = _ext(file.filename or "")
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type '.{ext}' not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}")

    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    doc_id  = str(uuid.uuid4())
    stored  = f"{doc_id}.{ext}"
    dest    = os.path.join(settings.UPLOAD_DIR, stored)
    with open(dest, "wb") as fh:
        fh.write(content)

    doc = await doc_repo.create(
        id=doc_id,
        project_id=project_id,
        original_filename=file.filename or stored,
        stored_filename=stored,
        file_type=ext.upper(),
        file_size_bytes=len(content),
        status="PENDING",
    )
    await db.commit()
    await db.refresh(doc)

    asyncio.create_task(run_index_document(doc_id, dest, project_id))

    return doc


@router.get("/{project_id}", response_model=list[DocumentRead])
async def list_documents(
    project_id: str,
    proj_repo: ProjectRepository = Depends(get_project_repo),
    doc_repo: DocumentRepository = Depends(get_document_repo),
):
    await proj_repo.get_or_raise(project_id)
    return await doc_repo.list_by_project(project_id)


@router.get("/{project_id}/stats", response_model=DocumentStats)
async def index_stats(
    project_id: str,
    doc_repo: DocumentRepository = Depends(get_document_repo),
):
    doc_count    = await doc_repo.count_by_project(project_id)
    total_chunks = await doc_repo.total_chunks_by_project(project_id)
    info         = get_index_stats(project_id)
    return DocumentStats(
        document_count=doc_count,
        indexed_count=doc_count,
        total_chunks=total_chunks,
        embedding_model=info.get("embedding_model", settings.EMBEDDING_MODEL),
        vector_store=info.get("vector_store", f"Qdrant @ {settings.QDRANT_URL}"),
    )


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    doc_repo: DocumentRepository = Depends(get_document_repo),
    db: AsyncSession = Depends(get_db),
):
    doc = await doc_repo.get_or_raise(document_id)

    # Remove vectors from Qdrant
    delete_document_vectors(str(doc.project_id), document_id)

    # Remove file from disk
    disk_path = os.path.join(settings.UPLOAD_DIR, doc.stored_filename)
    if os.path.exists(disk_path):
        os.remove(disk_path)

    await doc_repo.delete(doc)
    await db.commit()
