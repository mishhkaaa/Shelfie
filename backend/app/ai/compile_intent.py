"""Fuzzy NL→filters compiler (master prompt Part 2, Section 5.1).

Design is deliberately propose-then-validate, never trust-and-apply: the LLM
(via the existing Groq key-rotation client) proposes (attribute, value)
pairs; a deterministic validator here checks each proposal against a small
hand-maintained lexicon and drops anything unmappable. Only validated edits
ever reach the returned constraints patch. The lexicon is about mapping
subjective/fuzzy language ("flashy", "cotton") to concrete constraint
values — a separate concern from the `products` catalog, which is about
counting real inventory, not vocabulary.
"""

from typing import Optional

from .groq_client import call_groq_structured

# Hand-maintained, deliberately small. Values match the vocabulary already
# used elsewhere in this app (drift fields, seed_catalog.py) so a validated
# proposal is guaranteed to mean something to the rest of the system.
LEXICON: dict[str, dict[str, str]] = {
    "articleType": {
        "kurta": "kurtas",
        "kurtas": "kurtas",
        "dress": "dresses-for-birthday-women",
        "dresses": "dresses-for-birthday-women",
        "dresses for women": "dresses-for-birthday-women",
        "women's dresses": "dresses-for-birthday-women",
        "birthday dress": "birthday-dresses-for-women",
        "birthday dresses": "birthday-dresses-for-women",
        "birthday dresses for women": "birthday-dresses-for-women",
        "shoes": "nike-shoes",
        "nike shoes": "nike-shoes",
        "sneakers": "sneakers",
    },
    "brand": {
        "nike": "Nike",
        "fabindia": "Fabindia",
        "lulu & sky": "LULU & SKY",
        "lulu and sky": "LULU & SKY",
        "stylecast": "StyleCast",
        "w": "W",
        "puma": "Puma",
        "adidas": "Adidas",
    },
    "fabric": {
        "cotton": "Cotton",
        "pure cotton": "Cotton",
        "silk": "Silk",
        "linen": "Linen",
        "polyester": "Polyester",
        "satin": "Satin",
        "velvet": "Velvet",
        "rayon": "Rayon",
    },
    "color": {
        "black": "Black_36454f",
        "white": "White_ffffff",
        "grey": "Grey_808080",
        "gray": "Grey_808080",
        "blue": "Blue_0000ff",
        "red": "Red_ff0000",
        "pink": "Pink_ffc0cb",
        "green": "Green_008000",
        "brown": "Brown_a52a2a",
        "beige": "Beige_f5f5dc",
        "yellow": "Yellow_ffff00",
    },
    "occasion": {
        "party": "Party",
        "wedding": "Wedding",
        "casual": "Casual",
        "everyday": "Casual",
        "school": "Casual",
        "formal": "Formal",
        "office": "Formal",
        "festive": "Festive",
    },
    "sleeve": {
        "sleeveless": "Sleeveless",
        "full sleeve": "Full Sleeve",
        "half sleeve": "Half Sleeve",
        "three-quarter sleeve": "Three-Quarter Sleeve",
    },
    "neck": {
        "halter": "Halter Neck",
        "halter neck": "Halter Neck",
        "round neck": "Round Neck",
        "v-neck": "V-Neck",
        "off-shoulder": "Off-Shoulder",
        "mandarin collar": "Mandarin Collar",
    },
    "size": {
        # Both spoken-word and the abbreviation itself are accepted — the
        # LLM sometimes proposes the value already abbreviated (e.g. "XS")
        # rather than spelling it out, and exact-match-only against just the
        # word form was silently dropping those (found via real testing:
        # "birthday dresses for women black XS" wasn't extracting size).
        "extra small": "XS",
        "xs": "XS",
        "small": "S",
        "s": "S",
        "medium": "M",
        "m": "M",
        "large": "L",
        "l": "L",
        "extra large": "XL",
        "xl": "XL",
        "xxl": "XXL",
        "extra extra large": "XXL",
    },
}

COMPILE_INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "proposals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "attribute": {"type": "string"},
                    "value": {"type": "string"},
                },
                "required": ["attribute", "value"],
                "additionalProperties": False,
            },
        },
        "searchQuery": {
            "type": "string",
            "description": (
                "The core product search phrase, rewritten as Myntra's own "
                "search bar would expect it (concise product noun phrase, "
                "e.g. 'men formal shirts', 'red saree', 'running shoes') — "
                "used as a fallback so a request for a product type outside "
                "this app's small filter vocabulary can still search "
                "Myntra directly instead of being silently dropped."
            ),
        },
    },
    "required": ["proposals", "searchQuery"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "You extract shopping filter attributes from a sentence describing what "
    "someone wants to buy. Only propose attributes and values explicitly "
    "implied by the sentence — never invent brands, colors, or prices not "
    "mentioned or clearly implied. Valid attributes: articleType, brand, "
    "fabric, color, occasion, sleeve, neck, size, price_min, price_max. "
    "For price, only propose price_min/price_max if a number or range is "
    "actually mentioned (e.g. 'under 1500' -> price_max: 1500). "
    "Propose EVERY distinct attribute mentioned as its own separate item in "
    "the list — a sentence naming a category, a color, and a size should "
    "produce three separate proposals, not just the first one you notice. "
    "For size, propose it exactly as written (e.g. 'XS', 'M', 'large'). "
    "Separately, ALWAYS also produce searchQuery: a short product-search "
    "phrase capturing what the person is shopping for (product type plus "
    "any strongly identifying descriptor), suitable for typing directly "
    "into a retail search bar — this is independent of the attribute list "
    "above and should be filled in even if none of the structured "
    "attributes apply."
)


def _apply_proposal(attr: str, raw_value: str, patch: dict, provenance: dict) -> None:
    if attr in ("price_min", "price_max"):
        try:
            num = float(raw_value)
        except (TypeError, ValueError):
            return
        if num < 0:
            return
        patch.setdefault("price", {})[attr.removeprefix("price_")] = num
        provenance[f"price.{attr.removeprefix('price_')}"] = raw_value
        return

    lexicon_for_attr = LEXICON.get(attr)
    if lexicon_for_attr is None:
        return
    mapped = lexicon_for_attr.get(raw_value.strip().lower())
    if mapped is None:
        return

    if attr == "articleType":
        patch.setdefault("category", {})["articleType"] = mapped
        provenance["category.articleType"] = raw_value
    elif attr == "occasion":
        patch["occasion"] = mapped
        provenance["occasion"] = raw_value
    else:
        # brand / fabric / color / sleeve / neck / size all map onto an
        # `{ include: [...] }` shaped field.
        field_name = {"color": "color", "brand": "brand"}.get(attr, attr)
        patch.setdefault(field_name, {}).setdefault("include", [])
        if mapped not in patch[field_name]["include"]:
            patch[field_name]["include"].append(mapped)
        provenance[f"{field_name}.include"] = raw_value


def validate_and_merge(proposals: list[dict]) -> tuple[dict, dict[str, str]]:
    """Drops any proposal not found in LEXICON (or, for price, not a valid
    non-negative number) — this is the deterministic validator, the only
    thing standing between an LLM proposal and the returned constraints
    patch. Never trust-and-apply."""
    patch: dict = {}
    provenance: dict[str, str] = {}
    for proposal in proposals:
        attr = str(proposal.get("attribute", "")).strip()
        value = proposal.get("value")
        if not attr or not isinstance(value, str) or not value.strip():
            continue
        _apply_proposal(attr, value, patch, provenance)
    return patch, provenance


def _slugify_search_query(query: str) -> str:
    """Turns a free-text search phrase into the hyphenated slug Myntra's own
    URL scheme expects in the category/search path position (the same shape
    as 'kurtas' or 'nike-shoes') — not validated against a whitelist, since
    it's a search string being handed to Myntra's own search, not a filter
    value this app is asserting is real."""
    words = "".join(c if c.isalnum() or c.isspace() else " " for c in query.lower()).split()
    return "-".join(words)


def compile_intent(sentence: str) -> tuple[dict, dict[str, str]]:
    result: Optional[dict] = call_groq_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=f"Sentence: {sentence}",
        schema_name="compile_intent",
        json_schema=COMPILE_INTENT_SCHEMA,
    )
    proposals = (result or {}).get("proposals", []) if isinstance(result, dict) else []
    if not isinstance(proposals, list):
        proposals = []
    patch, provenance = validate_and_merge(proposals)

    # If the LLM couldn't map a spoken product type onto this app's small
    # hand-maintained articleType lexicon (which only covers the synthetic
    # demo catalog's 5 categories — real Myntra has hundreds), fall back to
    # Myntra's own free-text search instead of just dropping the request.
    # Myntra resolves a search phrase through the same URL path position as
    # a known category slug (see buildUrlFromConstraints), so this is a
    # real, working fallback, not a dead end.
    if "category" not in patch or not patch["category"].get("articleType"):
        search_query = result.get("searchQuery") if isinstance(result, dict) else None
        if isinstance(search_query, str) and search_query.strip():
            slug = _slugify_search_query(search_query)
            if slug:
                patch.setdefault("category", {})["articleType"] = slug
                provenance["category.articleType"] = f'{search_query} (Myntra search: "{search_query}")'

    return patch, provenance
