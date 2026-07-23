"""AI-generated shareable description of a saved profile — used when
sharing a profile (e.g. over WhatsApp). Same propose-with-deterministic-
fallback discipline as suggest_name.py/drift_phrasing.py: a failed or
unavailable Groq call never blocks sharing, it just falls back to a plain
template built directly from the constraints.
"""

from ..schemas import Constraints
from .groq_client import call_groq_structured

DESCRIBE_PROFILE_SCHEMA = {
    "type": "object",
    "properties": {"description": {"type": "string", "maxLength": 200}},
    "required": ["description"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "Write ONE short, friendly sentence describing a shopping filter profile, "
    "suitable for sharing with a friend or family member over WhatsApp — e.g. "
    "\"Cute black birthday dresses in cotton — perfect for a party!\". Only "
    "mention facts present in the given constraints JSON — never invent "
    "brands, colors, fabrics, or prices that aren't there."
)


def _deterministic_description(constraints: Constraints) -> str:
    bits = [constraints.category.articleType.replace("-", " ")]
    if constraints.brand.include:
        bits.append(f"from {', '.join(constraints.brand.include)}")
    if constraints.fabric.include:
        bits.append(f"in {', '.join(constraints.fabric.include)}")
    if constraints.color.include:
        colors = [c.split("_")[0] for c in constraints.color.include]
        bits.append(f"({', '.join(colors)})")
    if constraints.occasion:
        bits.append(f"for {constraints.occasion}")
    if constraints.price.min > 0 or constraints.price.max > 0:
        bits.append(f"₹{constraints.price.min:.0f}–₹{constraints.price.max:.0f}")
    return "Check out these " + " ".join(bits) + "!"


def describe_profile(constraints: Constraints) -> str:
    result = call_groq_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=f"Constraints: {constraints.model_dump_json()}",
        schema_name="describe_profile",
        json_schema=DESCRIBE_PROFILE_SCHEMA,
    )
    if isinstance(result, dict):
        description = result.get("description")
        if isinstance(description, str) and description.strip():
            return description.strip()
    return _deterministic_description(constraints)
