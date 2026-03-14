"""Project CRUD + GitLab connection test."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_project_repo
from app.core.security import encrypt_token
from app.db.repository import ProjectRepository
from app.db.session import get_db
from app.schemas.schemas import GitLabConnectionResult, ProjectCreate, ProjectRead, ProjectUpdate
from app.services.gitlab_service import GitLabService

router = APIRouter()


@router.post("/", response_model=ProjectRead, status_code=201)
async def create_project(
    payload: ProjectCreate,
    repo: ProjectRepository = Depends(get_project_repo),
    db: AsyncSession = Depends(get_db),
):
    data = payload.model_dump(exclude={"gitlab_token", "llm_api_key", "embedding_api_key"})
    if payload.gitlab_token:
        data["gitlab_token_encrypted"] = encrypt_token(payload.gitlab_token)
    if payload.llm_api_key:
        data["llm_api_key_encrypted"] = encrypt_token(payload.llm_api_key)
    if payload.embedding_api_key:
        data["embedding_api_key_encrypted"] = encrypt_token(payload.embedding_api_key)
    project = await repo.create(**data)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/", response_model=list[ProjectRead])
async def list_projects(repo: ProjectRepository = Depends(get_project_repo)):
    return await repo.list_all()


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: str, repo: ProjectRepository = Depends(get_project_repo)):
    return await repo.get_or_raise(project_id)


@router.put("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    repo: ProjectRepository = Depends(get_project_repo),
    db: AsyncSession = Depends(get_db),
):
    project = await repo.get_or_raise(project_id)

    for k, v in payload.model_dump(
        exclude_none=True,
        exclude={"gitlab_token", "llm_api_key", "embedding_api_key"},
    ).items():
        setattr(project, k, v)

    if payload.gitlab_token:
        project.gitlab_token_encrypted = encrypt_token(payload.gitlab_token)
    if payload.llm_api_key:
        project.llm_api_key_encrypted = encrypt_token(payload.llm_api_key)
    if payload.embedding_api_key:
        project.embedding_api_key_encrypted = encrypt_token(payload.embedding_api_key)

    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    repo: ProjectRepository = Depends(get_project_repo),
    db: AsyncSession = Depends(get_db),
):
    project = await repo.get_or_raise(project_id)
    await repo.delete(project)
    await db.commit()


@router.post("/{project_id}/test-connection", response_model=GitLabConnectionResult)
async def test_connection(
    project_id: str,
    repo: ProjectRepository = Depends(get_project_repo),
):
    project = await repo.get_or_raise(project_id)

    return GitLabService(project).test_connection()
