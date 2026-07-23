"""Semantic ranking of Discover's public profiles against a free-text
sentence (e.g. "ethnic wear for a wedding") — genuinely understands
synonyms/intent, unlike the client-side stemmed word-overlap ranking that
runs unconditionally as a fast/offline first pass. This is additive: the
extension ranks client-side immediately on every keystroke, then replaces
that ordering with this endpoint's result once it resolves, so a slow or
failed Groq call never blocks the search from being usable.

Deliberately does NOT invent or modify any profile data — Groq only ever
returns which of the profileIds we handed it are relevant, in order. A
profileId Groq returns that we didn't send is dropped; any profileId Groq
omits is treated as not relevant, not an error.
"""

from typing import Optional

from .groq_client import call_groq_structured

RANK_PROFILES_SCHEMA = {
    "type": "object",
    "properties": {
        "rankedProfileIds": {
            "type": "array",
            "items": {"type": "string"},
            "description": "profileIds of relevant profiles, most relevant first. Omit irrelevant ones entirely.",
        }
    },
    "required": ["rankedProfileIds"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "You rank a list of shopping profiles by how well they match what "
    "someone is looking for, given their free-text request. Each profile "
    "has an id, a name, and its filter attributes (article type, brand, "
    "fabric, color, occasion). Use real-world understanding of synonyms "
    "and related concepts — e.g. 'ethnic wear' should match sarees and "
    "kurtas, 'formal' should match office/business wear, a color name "
    "should match close shades. Only include profiles that are genuinely "
    "relevant; omit the rest entirely rather than forcing a full ranking. "
    "Return ONLY profileIds that were given to you."
)


def _describe_profile(item: dict) -> str:
    c = item.get("constraints") or {}
    parts = [
        f"id={item['profileId']}",
        f"name=\"{item['name']}\"",
        f"articleType={c.get('category', {}).get('articleType', '')}",
    ]
    brand = (c.get("brand") or {}).get("include") or []
    if brand:
        parts.append(f"brand={','.join(brand)}")
    fabric = (c.get("fabric") or {}).get("include") or []
    if fabric:
        parts.append(f"fabric={','.join(fabric)}")
    color = (c.get("color") or {}).get("include") or []
    if color:
        parts.append(f"color={','.join(c.split('_')[0] for c in color)}")
    if c.get("occasion"):
        parts.append(f"occasion={c['occasion']}")
    return " ".join(parts)


def rank_profiles(sentence: str, profiles: list[dict]) -> Optional[list[str]]:
    """Returns a relevance-ordered list of profileIds (subset of the input,
    possibly reordered/filtered), or None if Groq is unavailable/failed —
    callers must fall back to their existing client-side ranking on None,
    never treat it as "nothing is relevant"."""
    if not profiles:
        return []

    known_ids = {p["profileId"] for p in profiles}
    listing = "\n".join(_describe_profile(p) for p in profiles)
    user_prompt = f'Request: "{sentence}"\n\nProfiles:\n{listing}'

    result = call_groq_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        schema_name="rank_profiles",
        json_schema=RANK_PROFILES_SCHEMA,
    )
    if not isinstance(result, dict):
        return None

    ranked = result.get("rankedProfileIds")
    if not isinstance(ranked, list):
        return None

    # Never trust-and-apply IDs the model invented — only ever return a
    # subset of what was actually sent, same "propose then validate"
    # discipline as compile_intent.py.
    return [pid for pid in ranked if isinstance(pid, str) and pid in known_ids]
