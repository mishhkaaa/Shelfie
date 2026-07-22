"""Auto-suggested profile name (master prompt Section 8.1)."""

from typing import Optional

from ..schemas import Constraints
from .groq_client import call_groq_structured

SUGGEST_NAME_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestedName": {"type": "string", "maxLength": 40},
        "suggestedDescription": {"type": "string", "maxLength": 120},
    },
    "required": ["suggestedName", "suggestedDescription"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "You generate short, friendly names and descriptions for saved "
    "shopping-filter profiles. Only use facts present in the given "
    "constraints JSON — never invent brands, categories, or prices that "
    "aren't there."
)


def suggest_name(constraints: Constraints) -> tuple[Optional[str], Optional[str]]:
    """Returns (suggestedName, suggestedDescription), or (None, None) on any
    failure — the frontend must treat null as 'no suggestion', never an error."""
    user_prompt = f"Constraints JSON: {constraints.model_dump_json()}"
    result = call_groq_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        schema_name="suggest_name",
        json_schema=SUGGEST_NAME_SCHEMA,
    )
    if not result:
        return None, None

    name = result.get("suggestedName")
    description = result.get("suggestedDescription")
    if not isinstance(name, str) or not isinstance(description, str) or not name.strip():
        return None, None

    return name[:40], description[:120]
