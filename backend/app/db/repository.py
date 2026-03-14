"""Repository helpers — thin async wrappers over SQLAlchemy sessions."""
from __future__ import annotations

from typing import List, Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.models import Document, GenerationJob, Project, Requirement, TestCase


class ProjectRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, project_id: str) -> Optional[Project]:
        return await self.db.get(Project, project_id)

    async def get_or_raise(self, project_id: str) -> Project:
        p = await self.get(project_id)
        if not p:
            raise NotFoundError("Project", project_id)
        return p

    async def list_all(self) -> Sequence[Project]:
        result = await self.db.execute(select(Project).order_by(Project.created_at.desc()))
        return result.scalars().all()

    async def create(self, **kwargs) -> Project:
        p = Project(**kwargs)
        self.db.add(p)
        await self.db.flush()
        await self.db.refresh(p)
        return p

    async def delete(self, project: Project) -> None:
        await self.db.delete(project)
        await self.db.flush()


class DocumentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, doc_id: str) -> Optional[Document]:
        return await self.db.get(Document, doc_id)

    async def get_or_raise(self, doc_id: str) -> Document:
        d = await self.get(doc_id)
        if not d:
            raise NotFoundError("Document", doc_id)
        return d

    async def list_by_project(self, project_id: str) -> Sequence[Document]:
        result = await self.db.execute(
            select(Document)
            .where(Document.project_id == project_id)
            .order_by(Document.uploaded_at.desc())
        )
        return result.scalars().all()

    async def create(self, **kwargs) -> Document:
        d = Document(**kwargs)
        self.db.add(d)
        await self.db.flush()
        await self.db.refresh(d)
        return d

    async def count_by_project(self, project_id: str) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Document).where(Document.project_id == project_id)
        )
        return result.scalar_one()

    async def total_chunks_by_project(self, project_id: str) -> int:
        result = await self.db.execute(
            select(func.coalesce(func.sum(Document.chunk_count), 0))
            .where(Document.project_id == project_id)
            .where(Document.status == "INDEXED")
        )
        return result.scalar_one()

    async def delete(self, doc: Document) -> None:
        await self.db.delete(doc)
        await self.db.flush()


class RequirementRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, req_id: str) -> Optional[Requirement]:
        return await self.db.get(Requirement, req_id)

    async def get_or_raise(self, req_id: str) -> Requirement:
        r = await self.get(req_id)
        if not r:
            raise NotFoundError("Requirement", req_id)
        return r

    async def list_by_project(self, project_id: str) -> Sequence[Requirement]:
        result = await self.db.execute(
            select(Requirement)
            .where(Requirement.project_id == project_id)
            .order_by(Requirement.fetched_at.desc())
        )
        return result.scalars().all()

    async def find_by_issue_url(self, project_id: str, url: str) -> Optional[Requirement]:
        result = await self.db.execute(
            select(Requirement)
            .where(Requirement.project_id == project_id)
            .where(Requirement.gitlab_issue_url == url)
        )
        return result.scalar_one_or_none()

    async def find_by_issue_id(self, project_id: str, issue_id: int) -> Optional[Requirement]:
        result = await self.db.execute(
            select(Requirement)
            .where(Requirement.project_id == project_id)
            .where(Requirement.gitlab_issue_id == issue_id)
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> Requirement:
        r = Requirement(**kwargs)
        self.db.add(r)
        await self.db.flush()
        await self.db.refresh(r)
        return r

    async def delete(self, req: Requirement) -> None:
        await self.db.delete(req)
        await self.db.flush()


class TestCaseRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, tc_id: str) -> Optional[TestCase]:
        return await self.db.get(TestCase, tc_id)

    async def get_or_raise(self, tc_id: str) -> TestCase:
        tc = await self.get(tc_id)
        if not tc:
            raise NotFoundError("TestCase", tc_id)
        return tc

    async def list_by_requirement(self, req_id: str, fmt: Optional[str] = None) -> Sequence[TestCase]:
        q = select(TestCase).where(TestCase.requirement_id == req_id).order_by(TestCase.created_at)
        if fmt:
            q = q.where(TestCase.format == fmt.upper())
        result = await self.db.execute(q)
        return result.scalars().all()

    async def list_by_project(self, project_id: str, fmt: Optional[str] = None) -> Sequence[TestCase]:
        q = (
            select(TestCase)
            .join(Requirement, TestCase.requirement_id == Requirement.id)
            .where(Requirement.project_id == project_id)
            .order_by(TestCase.created_at)
        )
        if fmt:
            q = q.where(TestCase.format == fmt.upper())
        result = await self.db.execute(q)
        return result.scalars().all()

    async def create(self, **kwargs) -> TestCase:
        tc = TestCase(**kwargs)
        self.db.add(tc)
        await self.db.flush()
        await self.db.refresh(tc)
        return tc

    async def bulk_create(self, rows: List[TestCase]) -> None:
        self.db.add_all(rows)
        await self.db.flush()

    async def delete(self, tc: TestCase) -> None:
        await self.db.delete(tc)
        await self.db.flush()


class JobRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, job_id: str) -> Optional[GenerationJob]:
        return await self.db.get(GenerationJob, job_id)

    async def get_or_raise(self, job_id: str) -> GenerationJob:
        j = await self.get(job_id)
        if not j:
            raise NotFoundError("GenerationJob", job_id)
        return j

    async def create(self, **kwargs) -> GenerationJob:
        j = GenerationJob(**kwargs)
        self.db.add(j)
        await self.db.flush()
        await self.db.refresh(j)
        return j

    async def delete(self, job: GenerationJob) -> None:
        await self.db.delete(job)
        await self.db.flush()
