"""Groq key-pool utility (master prompt Section 1.1).

Round-robins across up to 4 API keys so load spreads evenly regardless of
which feature is calling. On HTTP 429 or 5xx, retries with the next key in
rotation (exponential backoff: 200ms, 400ms, 800ms), up to one attempt per
key. If every key fails, returns None — callers MUST treat None as "use the
documented deterministic fallback" and never surface a raw API error.
"""

import itertools
import json
import logging
import time
from typing import Optional

import httpx

from ..config import GROQ_API_KEYS, GROQ_MODEL, GROQ_STRICT_SUPPORTED_MODELS

logger = logging.getLogger("shelfie.groq")

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
BACKOFF_SECONDS = [0.2, 0.4, 0.8]

_key_cycle = itertools.cycle(range(len(GROQ_API_KEYS))) if GROQ_API_KEYS else None


def _next_key_index() -> int:
    assert _key_cycle is not None
    return next(_key_cycle)


def is_strict_supported() -> bool:
    return GROQ_MODEL in GROQ_STRICT_SUPPORTED_MODELS


def call_groq_structured(
    system_prompt: str,
    user_prompt: str,
    schema_name: str,
    json_schema: dict,
    timeout: float = 8.0,
) -> Optional[dict]:
    if not GROQ_API_KEYS:
        logger.warning("groq: no API keys configured, skipping call for %s", schema_name)
        return None

    strict = is_strict_supported()
    if strict:
        response_format = {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "schema": json_schema, "strict": True},
        }
    else:
        response_format = {"type": "json_object"}
        user_prompt = (
            f"{user_prompt}\n\nRespond with ONLY a valid JSON object matching this "
            f"schema (no prose, no markdown fences): {json.dumps(json_schema)}"
        )

    body = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": response_format,
        "temperature": 0.3,
    }

    attempts = min(4, len(GROQ_API_KEYS))
    last_error: Optional[str] = None

    with httpx.Client(timeout=timeout) as client:
        for attempt in range(attempts):
            key_index = _next_key_index()
            key = GROQ_API_KEYS[key_index]
            try:
                resp = client.post(
                    GROQ_ENDPOINT,
                    headers={"Authorization": f"Bearer {key}"},
                    json=body,
                )
                if resp.status_code == 429 or resp.status_code >= 500:
                    last_error = f"HTTP {resp.status_code}"
                    logger.warning(
                        "groq: key #%d got %s for %s, rotating (attempt %d/%d)",
                        key_index, last_error, schema_name, attempt + 1, attempts,
                    )
                    if attempt < attempts - 1:
                        time.sleep(BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)])
                    continue

                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                logger.info(
                    "groq: key #%d succeeded for %s (strict=%s, model=%s)",
                    key_index, schema_name, strict, GROQ_MODEL,
                )
                return parsed
            except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError, TypeError) as exc:
                last_error = str(exc)
                logger.warning("groq: key #%d failed for %s: %s", key_index, schema_name, exc)
                if attempt < attempts - 1:
                    time.sleep(BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)])
                continue

    logger.error(
        "groq: all %d key(s) exhausted for %s, last error: %s", attempts, schema_name, last_error
    )
    return None
