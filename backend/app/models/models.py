"""SQLAlchemy ORM models.

Uses String primary keys (UUID as str) so SQLite and PostgreSQL both work
without dialect-specific UUID columns.  All tables use cascade delete so
removing a Project cleans up everything beneath it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─────────────────────────────── Project ─────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str]                         = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str]                       = mapped_column(String(255), nullable=False)
    description: Mapped[str | None]         = mapped_column(Text)
    # GitLab
    gitlab_url: Mapped[str | None]          = mapped_column(String(512))
    gitlab_token_encrypted: Mapped[str | None] = mapped_column(Text)
    gitlab_project_path: Mapped[str | None] = mapped_column(String(512))
    # LLM
    llm_model: Mapped[str]                        = mapped_column(String(100), default="claude-sonnet-4-6")
    llm_provider: Mapped[str]                     = mapped_column(String(50),  default="anthropic")
    llm_api_key_encrypted: Mapped[str | None]     = mapped_column(Text)           # per-project key override
    llm_api_url: Mapped[str | None]               = mapped_column(String(512))    # custom base URL (Azure, Ollama…)
    # Embedding
    embedding_provider: Mapped[str | None]        = mapped_column(String(50))     # overrides global EMBEDDING_PROVIDER
    embedding_model: Mapped[str | None]           = mapped_column(String(100))    # overrides global EMBEDDING_MODEL
    embedding_api_key_encrypted: Mapped[str | None] = mapped_column(Text)         # per-project embedding key override
    custom_instructions: Mapped[str | None]       = mapped_column(Text)
    # Test generation defaults
    default_format: Mapped[str]             = mapped_column(String(20),  default="BDD")
    detail_level: Mapped[str]               = mapped_column(String(50),  default="detailed")
    # Issue import filters
    label_include: Mapped[str | None]       = mapped_column(String(512))
    label_exclude: Mapped[str | None]       = mapped_column(String(512))
    issue_state: Mapped[str]                = mapped_column(String(20),  default="opened")
    max_issues: Mapped[int]                 = mapped_column(Integer,      default=100)
    # Timestamps
    created_at: Mapped[datetime]            = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime]            = mapped_column(DateTime, default=_now, onupdate=_now)

    # Relationships — cascade delete keeps DB clean when a project is removed
    documents:    Mapped[list["Document"]]    = relationship(back_populates="project", cascade="all, delete-orphan")
    requirements: Mapped[list["Requirement"]] = relationship(back_populates="project", cascade="all, delete-orphan")


# ─────────────────────────────── Document ────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str]                      = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str]              = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    original_filename: Mapped[str]       = mapped_column(String(512), nullable=False)
    stored_filename: Mapped[str]         = mapped_column(String(512), nullable=False)
    file_type: Mapped[str]               = mapped_column(String(20))
    file_size_bytes: Mapped[int]         = mapped_column(Integer, default=0)
    chunk_count: Mapped[int]             = mapped_column(Integer, default=0)
    # PENDING | INDEXING | INDEXED | FAILED
    status: Mapped[str]                  = mapped_column(String(20), default="PENDING")
    error_message: Mapped[str | None]    = mapped_column(Text)
    uploaded_at: Mapped[datetime]        = mapped_column(DateTime, default=_now)

    project: Mapped["Project"] = relationship(back_populates="documents")


# ─────────────────────────────── Requirement ─────────────────────────────────

class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str]                          = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str]                  = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    gitlab_issue_id: Mapped[int | None]      = mapped_column(Integer)
    gitlab_issue_url: Mapped[str | None]     = mapped_column(String(1024))
    title: Mapped[str]                       = mapped_column(String(512), nullable=False)
    description: Mapped[str | None]          = mapped_column(Text)
    labels: Mapped[str | None]               = mapped_column(String(512))
    assignee: Mapped[str | None]             = mapped_column(String(255))
    milestone: Mapped[str | None]            = mapped_column(String(255))
    fetched_at: Mapped[datetime]             = mapped_column(DateTime, default=_now)

    project:         Mapped["Project"]              = relationship(back_populates="requirements")
    test_cases:      Mapped[list["TestCase"]]        = relationship(back_populates="requirement", cascade="all, delete-orphan")
    generation_jobs: Mapped[list["GenerationJob"]]   = relationship(back_populates="requirement", cascade="all, delete-orphan")


# ─────────────────────────────── TestCase ────────────────────────────────────

class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[str]                    = mapped_column(String(36), primary_key=True, default=_uuid)
    requirement_id: Mapped[str]        = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"))
    title: Mapped[str]                 = mapped_column(String(512), nullable=False)
    format: Mapped[str]                = mapped_column(String(20), nullable=False)   # BDD | MANUAL
    content: Mapped[str]               = mapped_column(Text, nullable=False)
    priority: Mapped[str]              = mapped_column(String(20), default="MEDIUM")
    tags: Mapped[str | None]           = mapped_column(String(512))
    scenario_type: Mapped[str | None]  = mapped_column(String(50))
    edited: Mapped[bool]               = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime]       = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime]       = mapped_column(DateTime, default=_now, onupdate=_now)

    requirement: Mapped["Requirement"] = relationship(back_populates="test_cases")


# ─────────────────────────────── GenerationJob ───────────────────────────────

class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str]                       = mapped_column(String(36), primary_key=True, default=_uuid)
    requirement_id: Mapped[str]           = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"))
    # PENDING | RUNNING | COMPLETE | FAILED
    status: Mapped[str]                   = mapped_column(String(20), default="PENDING")
    format: Mapped[str]                   = mapped_column(String(20), default="BDD")
    count_hint: Mapped[str]               = mapped_column(String(20), default="auto")
    progress_message: Mapped[str | None]  = mapped_column(String(512))
    error_message: Mapped[str | None]     = mapped_column(Text)
    created_at: Mapped[datetime]          = mapped_column(DateTime, default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    requirement: Mapped["Requirement"] = relationship(back_populates="generation_jobs")
