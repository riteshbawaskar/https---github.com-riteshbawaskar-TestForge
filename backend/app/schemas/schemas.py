"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ─────────────────────────────── Project ─────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str                             = Field(..., min_length=1, max_length=255)
    description: Optional[str]           = None
    gitlab_url: Optional[str]            = None
    gitlab_token: Optional[str]          = Field(None, description="Plain token — encrypted before storage")
    gitlab_project_path: Optional[str]   = None
    llm_model: str                       = "claude-sonnet-4-6"
    llm_provider: str                    = "anthropic"
    llm_api_key: Optional[str]           = Field(None, description="Per-project LLM key — encrypted before storage")
    llm_api_url: Optional[str]           = None
    embedding_provider: Optional[str]    = None
    embedding_model: Optional[str]       = None
    embedding_api_key: Optional[str]     = Field(None, description="Per-project embedding key — encrypted before storage")
    custom_instructions: Optional[str]   = None
    default_format: str                  = "BDD"
    detail_level: str                    = "detailed"
    label_include: Optional[str]         = None
    label_exclude: Optional[str]         = None
    issue_state: str                     = "opened"
    max_issues: int                      = Field(100, ge=1, le=500)


class ProjectUpdate(BaseModel):
    name: Optional[str]                  = Field(None, min_length=1, max_length=255)
    description: Optional[str]          = None
    gitlab_url: Optional[str]           = None
    gitlab_token: Optional[str]         = None
    gitlab_project_path: Optional[str]  = None
    llm_model: Optional[str]            = None
    llm_provider: Optional[str]         = None
    llm_api_key: Optional[str]          = None
    llm_api_url: Optional[str]          = None
    embedding_provider: Optional[str]   = None
    embedding_model: Optional[str]      = None
    embedding_api_key: Optional[str]    = None
    custom_instructions: Optional[str]  = None
    default_format: Optional[str]       = None
    detail_level: Optional[str]         = None
    label_include: Optional[str]        = None
    label_exclude: Optional[str]        = None
    issue_state: Optional[str]          = None
    max_issues: Optional[int]           = Field(None, ge=1, le=500)


class ProjectRead(BaseModel):
    id: str
    name: str
    description: Optional[str]
    gitlab_url: Optional[str]
    gitlab_project_path: Optional[str]
    llm_model: str
    llm_provider: str
    llm_api_url: Optional[str]
    llm_api_key_set: bool = False        # True if a per-project key is stored
    embedding_provider: Optional[str]
    embedding_model: Optional[str]
    embedding_api_key_set: bool = False  # True if a per-project embedding key is stored
    custom_instructions: Optional[str]
    default_format: str
    detail_level: str
    label_include: Optional[str]
    label_exclude: Optional[str]
    issue_state: str
    max_issues: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        """Inject computed `*_key_set` booleans before standard validation."""
        if hasattr(obj, "llm_api_key_encrypted"):
            d = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
            d["llm_api_key_set"]       = bool(obj.llm_api_key_encrypted)
            d["embedding_api_key_set"] = bool(obj.embedding_api_key_encrypted)
            return super().model_validate(d, **kwargs)
        return super().model_validate(obj, **kwargs)


class GitLabConnectionResult(BaseModel):
    connected: bool
    project_name: Optional[str]       = None
    open_issues_count: Optional[int]  = None
    error: Optional[str]              = None


# ─────────────────────────────── Document ────────────────────────────────────

class DocumentRead(BaseModel):
    id: str
    project_id: str
    original_filename: str
    stored_filename: str
    file_type: str
    file_size_bytes: int
    chunk_count: int
    status: str
    error_message: Optional[str]
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class DocumentStats(BaseModel):
    document_count: int
    indexed_count: int
    total_chunks: int
    embedding_model: str
    vector_store: str


# ─────────────────────────────── Requirement ─────────────────────────────────

class RequirementFetch(BaseModel):
    gitlab_issue_id: int
    project_id: str


class RequirementRead(BaseModel):
    id: str
    project_id: str
    gitlab_issue_id: Optional[int]
    gitlab_issue_url: Optional[str]
    title: str
    description: Optional[str]
    labels: Optional[str]
    assignee: Optional[str]
    milestone: Optional[str]
    fetched_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────── TestCase ────────────────────────────────────

class TestCaseRead(BaseModel):
    id: str
    requirement_id: str
    title: str
    format: str
    content: str
    priority: str
    tags: Optional[str]
    scenario_type: Optional[str]
    edited: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TestCaseUpdate(BaseModel):
    title: Optional[str]          = Field(None, min_length=1)
    content: Optional[str]        = None
    priority: Optional[str]       = None
    tags: Optional[str]           = None
    scenario_type: Optional[str]  = None


# ─────────────────────────────── Generation ──────────────────────────────────

class GenerateRequest(BaseModel):
    requirement_id: str
    format: str             = "BDD"       # BDD | MANUAL | BOTH
    count_hint: str         = "auto"      # auto | 3-5 | 5-10 | 10+
    additional_context: Optional[str] = None


class JobRead(BaseModel):
    id: str
    requirement_id: str
    status: str
    format: str
    count_hint: str
    progress_message: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ─────────────────────────────── Export ──────────────────────────────────────

class TestCaseCreate(BaseModel):
    requirement_id: str
    title: str                    = Field(..., min_length=1)
    format: str                   = "BDD"           # BDD | MANUAL
    content: str                  = ""
    priority: str                 = "MEDIUM"        # HIGH | MEDIUM | LOW
    tags: Optional[str]           = None
    scenario_type: Optional[str]  = None


class ExportRequest(BaseModel):
    project_id: Optional[str]     = None
    requirement_id: Optional[str] = None
    format: str                   = "BDD"    # BDD | MANUAL | BOTH
    file_type: str                = "csv"    # csv | json
