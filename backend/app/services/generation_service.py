"""LLM-powered test case generation with Qdrant RAG context."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List

from app.core.config import settings
from app.core.exceptions import LLMError
from app.services.document_service import retrieve_context

import logging
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


def _call_llm(system: str, user: str, provider: str, model: str) -> List[Dict[str, Any]]:
    """Call Anthropic or OpenAI and parse the response. Simple 1-retry on parse failure."""
    if provider == "anthropic":
        if not settings.ANTHROPIC_API_KEY:
            raise LLMError("ANTHROPIC_API_KEY is not set")
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model=model,
            max_tokens=settings.LLM_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        raw = resp.content[0].text

    elif provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise LLMError("OPENAI_API_KEY is not set")
        import openai
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=settings.LLM_MAX_TOKENS,
        )
        raw = resp.choices[0].message.content or ""

    elif provider == "gemini":
        if not settings.GEMINI_API_KEY:
            raise LLMError("GEMINI_API_KEY is not set")
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
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

    else:
        raise LLMError(f"Unknown provider: {provider!r}. Must be 'anthropic', 'openai', or 'gemini'")

    log.info(f"llm_response provider={provider} length={len(raw)}")
    return _clean_and_parse(raw)


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
) -> List[Dict[str, Any]]:
    """Generate test cases using RAG + LLM. fmt = BDD | MANUAL | BOTH."""

    if fmt == "BOTH":
        bdd    = generate_test_cases(requirement, project_id, "BDD",    count_hint, additional_context, llm_provider, llm_model, custom_instructions)
        manual = generate_test_cases(requirement, project_id, "MANUAL", count_hint, additional_context, llm_provider, llm_model, custom_instructions)
        for tc in bdd:    tc["format"] = "BDD"
        for tc in manual: tc["format"] = "MANUAL"
        return bdd + manual

    # RAG
    query  = f"{requirement['title']} {requirement.get('description', '')}"
    chunks = retrieve_context(query, project_id)
    log.info(f"generation_context chunks={len(chunks)} format={fmt}")

    system = BDD_SYSTEM if fmt == "BDD" else MANUAL_SYSTEM
    if custom_instructions:
        system += f"\n\n## Project Instructions\n{custom_instructions}"

    user = _build_prompt(requirement, chunks, count_hint, additional_context)

    # One retry on parse failure
    try:
        cases = _call_llm(system, user, llm_provider, llm_model)
    except LLMError:
        log.warning("llm_parse_failed — retrying once")
        cases = _call_llm(system, user, llm_provider, llm_model)

    # Normalise
    for tc in cases:
        content = tc.get("content", "")
        if isinstance(content, dict):
            tc["content"] = json.dumps(content, indent=2)
        tc.setdefault("format", fmt)
        tc.setdefault("scenario_type", "positive")
        tc.setdefault("priority", "MEDIUM")
        tc.setdefault("tags", "")

    log.info(f"generation_complete format={fmt} count={len(cases)}")
    return cases
