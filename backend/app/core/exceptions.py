"""Domain exceptions."""
from __future__ import annotations


class TestForgeError(Exception):
    """Base class for all TestForge application errors."""


class NotFoundError(TestForgeError):
    def __init__(self, resource: str, id: object) -> None:
        super().__init__(f"{resource} '{id}' not found")


class GitLabError(TestForgeError):
    pass


class LLMError(TestForgeError):
    pass


class DocumentIngestionError(TestForgeError):
    pass
