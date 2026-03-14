"""Application settings — loaded from .env or environment variables."""
from __future__ import annotations

from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── App ───────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    # ── Database — SQLite ─────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./testforge.db"

    # ── LLM ──────────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    DEFAULT_LLM_PROVIDER: str = "anthropic"
    DEFAULT_LLM_MODEL: str = "claude-sonnet-4-6"
    LLM_MAX_TOKENS: int = 4096

    # ── Vector Store — Qdrant ─────────────────────────────────────────────
    # Local file mode (default, no server needed): set QDRANT_PATH to a directory.
    # To use a remote/Docker Qdrant instead, clear QDRANT_PATH and set QDRANT_URL.
    QDRANT_PATH: str = "./qdrant_storage"   # persisted local directory
    QDRANT_URL: str = ""                    # leave empty to use QDRANT_PATH
    QDRANT_API_KEY: str = ""
    EMBEDDING_PROVIDER: str = "openai"        # openai | gemini | local
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    RAG_TOP_K: int = 5

    # ── Encryption — simple XOR + base64 (good enough for local dev) ──────
    # 32-char secret used to obfuscate stored tokens.
    # Generate: python -c "import secrets; print(secrets.token_hex(16))"
    ENCRYPTION_SECRET: str = "changeme_set_in_dotenv_32chars!!"

    # ── Uploads ───────────────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: List[str] = ["pdf", "docx", "txt", "md", "xlsx", "csv"]

    # ── GitLab ────────────────────────────────────────────────────────────
    GITLAB_REQUEST_TIMEOUT: int = 30

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()
