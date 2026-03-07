"""FastAPI dependency factories."""
from __future__ import annotations

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.repository import (
    DocumentRepository,
    JobRepository,
    ProjectRepository,
    RequirementRepository,
    TestCaseRepository,
)


def get_project_repo(db: AsyncSession = Depends(get_db)) -> ProjectRepository:
    return ProjectRepository(db)


def get_document_repo(db: AsyncSession = Depends(get_db)) -> DocumentRepository:
    return DocumentRepository(db)


def get_requirement_repo(db: AsyncSession = Depends(get_db)) -> RequirementRepository:
    return RequirementRepository(db)


def get_testcase_repo(db: AsyncSession = Depends(get_db)) -> TestCaseRepository:
    return TestCaseRepository(db)


def get_job_repo(db: AsyncSession = Depends(get_db)) -> JobRepository:
    return JobRepository(db)
