"""Helpers for estimating, aggregating, and pricing AI token usage."""
from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from typing import Any


@dataclass
class UsageMetrics:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    requests: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    def add(self, other: "UsageMetrics | None") -> "UsageMetrics":
        if not other:
            return self
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cost_usd += other.cost_usd
        self.requests += other.requests
        return self


LLM_DEFAULT_PRICING_PER_MILLION: dict[str, tuple[float, float]] = {
    "anthropic": (3.0, 15.0),
    "openai": (2.5, 10.0),
    "gemini": (1.25, 5.0),
    "local": (0.0, 0.0),
}

EMBEDDING_DEFAULT_PRICING_PER_MILLION: dict[str, float] = {
    "openai": 0.02,
    "gemini": 0.15,
    "local": 0.0,
}


def estimate_text_tokens(text: str) -> int:
    stripped = text.strip()
    if not stripped:
        return 0
    return max(1, ceil(len(stripped) / 4))


def estimate_texts_tokens(texts: list[str]) -> int:
    return sum(estimate_text_tokens(text) for text in texts)


def _normalise(value: str) -> str:
    return value.strip().lower()


def _llm_rates(provider: str, model: str) -> tuple[float, float]:
    provider_key = _normalise(provider)
    model_key = _normalise(model)

    if provider_key == "anthropic":
        if "haiku" in model_key:
            return (0.8, 4.0)
        if "opus" in model_key:
            return (15.0, 75.0)
        return (3.0, 15.0)

    if provider_key == "openai":
        if "mini" in model_key:
            return (0.15, 0.6)
        if "nano" in model_key:
            return (0.05, 0.2)
        if "gpt-4o" in model_key:
            return (2.5, 10.0)
        if "gpt-4.1" in model_key:
            return (2.0, 8.0)
        return LLM_DEFAULT_PRICING_PER_MILLION["openai"]

    if provider_key == "gemini":
        if "flash" in model_key:
            return (0.35, 1.05)
        return LLM_DEFAULT_PRICING_PER_MILLION["gemini"]

    return LLM_DEFAULT_PRICING_PER_MILLION.get(provider_key, (0.0, 0.0))


def _embedding_rate(provider: str, model: str) -> float:
    provider_key = _normalise(provider)
    model_key = _normalise(model)

    if provider_key == "openai":
        if "large" in model_key:
            return 0.13
        if "ada" in model_key:
            return 0.10
        return 0.02

    if provider_key == "gemini":
        return 0.15

    return EMBEDDING_DEFAULT_PRICING_PER_MILLION.get(provider_key, 0.0)


def build_llm_usage(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    requests: int = 1,
) -> UsageMetrics:
    input_rate, output_rate = _llm_rates(provider, model)
    cost = ((input_tokens * input_rate) + (output_tokens * output_rate)) / 1_000_000
    return UsageMetrics(
        input_tokens=max(0, input_tokens),
        output_tokens=max(0, output_tokens),
        cost_usd=cost,
        requests=max(0, requests),
    )


def build_embedding_usage(
    provider: str,
    model: str,
    token_count: int,
    requests: int = 1,
) -> UsageMetrics:
    rate = _embedding_rate(provider, model)
    return UsageMetrics(
        input_tokens=max(0, token_count),
        output_tokens=0,
        cost_usd=(max(0, token_count) * rate) / 1_000_000,
        requests=max(0, requests),
    )


def extract_openai_chat_usage(response: Any, provider: str, model: str, fallback_prompt: str, fallback_completion: str) -> UsageMetrics:
    usage = getattr(response, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", None)
    completion_tokens = getattr(usage, "completion_tokens", None)
    if prompt_tokens is None:
        prompt_tokens = estimate_text_tokens(fallback_prompt)
    if completion_tokens is None:
        completion_tokens = estimate_text_tokens(fallback_completion)
    return build_llm_usage(provider, model, prompt_tokens, completion_tokens)


def extract_anthropic_usage(response: Any, provider: str, model: str, fallback_prompt: str, fallback_completion: str) -> UsageMetrics:
    usage = getattr(response, "usage", None)
    input_tokens = getattr(usage, "input_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None)
    if input_tokens is None:
        input_tokens = estimate_text_tokens(fallback_prompt)
    if output_tokens is None:
        output_tokens = estimate_text_tokens(fallback_completion)
    return build_llm_usage(provider, model, input_tokens, output_tokens)


def extract_gemini_llm_usage(response: Any, provider: str, model: str, fallback_prompt: str, fallback_completion: str) -> UsageMetrics:
    usage = getattr(response, "usage_metadata", None)
    prompt_tokens = getattr(usage, "prompt_token_count", None)
    completion_tokens = getattr(usage, "candidates_token_count", None)
    if prompt_tokens is None:
        prompt_tokens = estimate_text_tokens(fallback_prompt)
    if completion_tokens is None:
        completion_tokens = estimate_text_tokens(fallback_completion)
    return build_llm_usage(provider, model, prompt_tokens, completion_tokens)


def extract_openai_embedding_usage(response: Any, provider: str, model: str, texts: list[str]) -> UsageMetrics:
    usage = getattr(response, "usage", None)
    token_count = getattr(usage, "total_tokens", None)
    if token_count is None:
        token_count = estimate_texts_tokens(texts)
    return build_embedding_usage(provider, model, token_count)


def extract_gemini_embedding_usage(response: Any, provider: str, model: str, text: str) -> UsageMetrics:
    usage = getattr(response, "usage_metadata", None)
    token_count = getattr(usage, "prompt_token_count", None)
    if token_count is None:
        token_count = estimate_text_tokens(text)
    return build_embedding_usage(provider, model, token_count)