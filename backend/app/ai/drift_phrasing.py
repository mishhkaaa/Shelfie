"""Natural-language drift reason phrasing (master prompt Section 8.2).

Never touches `decision` or `fieldContributions` — only rephrases the
already-computed deterministic reason string. If this call fails, the caller
must fall back to drift.deterministic_reason() unchanged."""

from typing import Optional

from .groq_client import call_groq_structured

REASON_SCHEMA = {
    "type": "object",
    "properties": {"reason": {"type": "string", "maxLength": 200}},
    "required": ["reason"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "You rephrase a technical field-contribution breakdown as one friendly, "
    "single sentence a shopper would understand. Never invent facts not "
    "present in the data you're given."
)


def phrase_drift_reason(field_contributions: dict[str, float], decision: str) -> Optional[str]:
    user_prompt = (
        f"Field contribution breakdown: {field_contributions}. Decision: {decision}. "
        "Rephrase this as one friendly sentence, without inventing any facts not in the data."
    )
    result = call_groq_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        schema_name="drift_reason",
        json_schema=REASON_SCHEMA,
    )
    if not result:
        return None
    reason = result.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        return None
    return reason
