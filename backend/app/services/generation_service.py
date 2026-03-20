"""LLM-powered test case generation with Qdrant RAG context."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.exceptions import LLMError
from app.services.document_service import EmbeddingConfig, retrieve_context
from app.services.usage_service import (
    UsageMetrics,
    extract_anthropic_usage,
    extract_gemini_llm_usage,
    extract_openai_chat_usage,
)

log = logging.getLogger(__name__)

# ─────────────────────────────── System prompts ──────────────────────────────

BDD_SYSTEM = """\
You are an expert QA engineer writing BDD test cases in Gherkin format.

Given a requirement and documentation context, generate thorough test cases covering:
- Happy path / positive scenarios
- Negative and boundary cases
- Edge cases
- Security considerations where relevant

RULES:
- Use clean Gherkin with 2-space indentation.
- Keep scenario titles short and unique.
- Each scenario must be self-contained.

RESPONSE: return ONLY a valid JSON array, no markdown, no extra text:
[
  {
    "title": "Short descriptive title",
    "scenario_type": "positive"|"negative"|"edge"|"security"|"performance",
    "priority": "HIGH"|"MEDIUM"|"LOW",
    "tags": "comma,separated",
    "content": "Feature: ...\\n\\nScenario: ...\\n  Given ...\\n  When ...\\n  Then ..."
  }
]
"""

MANUAL_SYSTEM = """\
You are an expert QA engineer writing structured manual test cases.

RULES:
- Give each case a unique ID prefix: TC-<AREA>-<NNN>.
- Steps must be atomic and in execution order.
- Expected results must be observable.

RESPONSE: return ONLY a valid JSON array, no markdown, no extra text:
[
  {
    "title": "TC-XXX-001 · Short title",
    "scenario_type": "positive"|"negative"|"edge"|"security"|"performance",
    "priority": "HIGH"|"MEDIUM"|"LOW",
    "tags": "comma,separated",
    "content": {
      "preconditions": "...",
      "test_data": "...",
      "steps": [{"step": 1, "action": "...", "expected": "..."}]
    }
  }
]
"""


@dataclass
class GenerationResult:
    cases: List[Dict[str, Any]]
    llm_usage: UsageMetrics
    embedding_usage: UsageMetrics


# ─────────────────────────────── Helpers ─────────────────────────────────────

def _build_prompt(req: Dict, chunks: List[str], count_hint: str, extra: str) -> str:
    ctx = "\n\n---\n\n".join(chunks) if chunks else "No documentation context available."
    count = "an appropriate number of" if count_hint == "auto" else count_hint
    focus = f"\n## Focus\n{extra}" if extra.strip() else ""
    return f"""\
## Requirement
Title: {req["title"]}
Description:
{req.get("description", "No description.")}
Labels: {req.get("labels", "")}

## Documentation Context
{ctx}

## Instructions
Generate {count} test cases covering all important scenarios.{focus}

Return ONLY the JSON array.
"""


def _clean_and_parse(raw: str) -> List[Dict[str, Any]]:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LLMError(f"LLM returned invalid JSON: {exc}\nRaw (first 300): {raw[:300]}") from exc
    if not isinstance(result, list):
        raise LLMError(f"Expected JSON array, got {type(result).__name__}")
    return result


def _call_llm(
    system: str,
    user: str,
    provider: str,
    model: str,
    api_key: str = "",
    api_url: str = "",
) -> tuple[str, UsageMetrics]:
    """Call Anthropic, OpenAI, or Gemini and return raw output plus usage."""
    if provider == "anthropic":
        key = api_key or settings.ANTHROPIC_API_KEY
        if not key:
            raise LLMError("No Anthropic API key configured (set in project settings or ANTHROPIC_API_KEY env var)")
        import anthropic

        kwargs: Dict[str, Any] = {"api_key": key}
        if api_url:
            kwargs["base_url"] = api_url
        client = anthropic.Anthropic(**kwargs)
        resp = client.messages.create(
            model=model,
            max_tokens=settings.LLM_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        raw = resp.content[0].text
        usage = extract_anthropic_usage(resp, provider, model, f"{system}\n\n{user}", raw)

    elif provider == "openai":
        key = api_key or settings.OPENAI_API_KEY
        if not key:
            raise LLMError("No OpenAI API key configured (set in project settings or OPENAI_API_KEY env var)")
        import openai

        kwargs = {"api_key": key}
        if api_url:
            kwargs["base_url"] = api_url
        client = openai.OpenAI(**kwargs)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=settings.LLM_MAX_TOKENS,
        )
        raw = resp.choices[0].message.content or ""
        usage = extract_openai_chat_usage(resp, provider, model, f"{system}\n\n{user}", raw)

    elif provider == "gemini":
        key = api_key or settings.GEMINI_API_KEY
        if not key:
            raise LLMError("No Gemini API key configured (set in project settings or GEMINI_API_KEY env var)")
        import google.generativeai as genai

        genai.configure(api_key=key)
        gemini_model = genai.GenerativeModel(
            model_name=model,
            system_instruction=system,
        )
        resp = gemini_model.generate_content(
            user,
            generation_config=genai.GenerationConfig(
                max_output_tokens=settings.LLM_MAX_TOKENS,
                temperature=0.3,
            ),
        )
        raw = resp.text
        usage = extract_gemini_llm_usage(resp, provider, model, f"{system}\n\n{user}", raw)

    else:
        raise LLMError(f"Unknown provider: {provider!r}. Must be 'anthropic', 'openai', or 'gemini'")

    log.info(f"llm_response provider={provider} length={len(raw)}")
    return raw, usage


# ─────────────────────────────── Public API ──────────────────────────────────

def generate_test_cases(
    requirement: Dict[str, Any],
    project_id: str,
    fmt: str = "BDD",
    count_hint: str = "auto",
    additional_context: str = "",
    llm_provider: str = "anthropic",
    llm_model: str = "claude-sonnet-4-6",
    custom_instructions: str = "",
    api_key: str = "",
    api_url: str = "",
    embedding_cfg: Optional["EmbeddingConfig"] = None,
) -> GenerationResult:
    """Generate test cases using RAG + LLM. fmt = BDD | MANUAL | BOTH."""

    if fmt == "BOTH":
        bdd = generate_test_cases(requirement, project_id, "BDD", count_hint, additional_context, llm_provider, llm_model, custom_instructions, api_key, api_url, embedding_cfg)
        manual = generate_test_cases(requirement, project_id, "MANUAL", count_hint, additional_context, llm_provider, llm_model, custom_instructions, api_key, api_url, embedding_cfg)
        for tc in bdd.cases:
            tc["format"] = "BDD"
        for tc in manual.cases:
            tc["format"] = "MANUAL"
        return GenerationResult(
            cases=bdd.cases + manual.cases,
            llm_usage=UsageMetrics().add(bdd.llm_usage).add(manual.llm_usage),
            embedding_usage=UsageMetrics().add(bdd.embedding_usage).add(manual.embedding_usage),
        )

    query = f"{requirement['title']} {requirement.get('description', '')}"
    chunks, embedding_usage = retrieve_context(query, project_id, cfg=embedding_cfg)
    log.info(f"generation_context chunks={len(chunks)} format={fmt}")

    system = BDD_SYSTEM if fmt == "BDD" else MANUAL_SYSTEM
    if custom_instructions:
        system += f"\n\n## Project Instructions\n{custom_instructions}"

    user = _build_prompt(requirement, chunks, count_hint, additional_context)
    llm_usage = UsageMetrics()

    try:
        raw, call_usage = _call_llm(system, user, llm_provider, llm_model, api_key, api_url)
        llm_usage.add(call_usage)
        cases = _clean_and_parse(raw)
    except LLMError as exc:
        log.warning("llm_parse_failed — retrying once")
        try:
            raw, retry_usage = _call_llm(system, user, llm_provider, llm_model, api_key, api_url)
            llm_usage.add(retry_usage)
            cases = _clean_and_parse(raw)
        except LLMError as retry_exc:
            retry_exc.llm_usage = llm_usage
            retry_exc.embedding_usage = embedding_usage
            raise retry_exc from exc

    for tc in cases:
        content = tc.get("content", "")
        if isinstance(content, dict):
            tc["content"] = json.dumps(content, indent=2)
        tc.setdefault("format", fmt)
        tc.setdefault("scenario_type", "positive")
        tc.setdefault("priority", "MEDIUM")
        tc.setdefault("tags", "")

    log.info(f"generation_complete format={fmt} count={len(cases)}")
    return GenerationResult(cases=cases, llm_usage=llm_usage, embedding_usage=embedding_usage)
