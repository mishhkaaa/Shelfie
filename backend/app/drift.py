"""Deterministic drift engine (master prompt Section 7). Pure math, no AI —
the whole point is that `decision` and `fieldContributions` are explainable
and auditable, never a black box. Only the `reason` string's phrasing may
optionally be AI-enhanced later (Section 8.2), and even then this module's
deterministic template is the guaranteed, always-computable fallback.

Field list is adapted to the *actual* extension/src/api/types.ts Constraints
shape, not the master prompt's Section 3 draft: `rating` is `{ min: number }`
(not a bare number) and `occasion` is a single optional string (not a set) —
see BACKEND_BUILD_LOG.md kickoff entry for why. `neck.include` was added
later (2026-07-22, after real-browser testing surfaced that Myntra's Neck
filter wasn't being captured at all) — its weight is carved out of the
former `sleeve.include: 0.02` budget, split evenly (0.01 each), so the total
still sums to exactly 1.0 without disturbing any other field's weight.
"""

from .schemas import Constraints

WEIGHTS: dict[str, float] = {
    "category.articleType": 0.50,
    "category.gender": 0.08,
    "brand.include": 0.12,
    "price": 0.10,
    "fabric.include": 0.08,
    "color.include": 0.06,
    "size.include": 0.03,
    "sleeve.include": 0.01,
    "neck.include": 0.01,
    "rating": 0.005,
    "occasion": 0.005,
}

TAU_LOW = 0.10
TAU_HIGH = 0.45

DECISION_PHRASES = {
    "new_profile": "treating this as a new profile",
    "new_version": "saving this as a new version",
    "update": "just updating the current version in place",
}


def _jaccard(a: list[str], b: list[str]) -> float:
    set_a, set_b = set(a), set(b)
    if not set_a and not set_b:
        return 0.0
    union = set_a | set_b
    inter = set_a & set_b
    return 1 - len(inter) / len(union)


def _price_distance(a: dict, b: dict) -> float:
    overlap = max(0.0, min(a["max"], b["max"]) - max(a["min"], b["min"]))
    union = max(a["max"], b["max"]) - min(a["min"], b["min"])
    if union <= 0:
        return 0.0
    return 1 - overlap / union


def _exact_distance(a, b) -> float:
    return 0.0 if a == b else 1.0


def _rating_distance(a: dict, b: dict) -> float:
    return min(1.0, abs(a["min"] - b["min"]) / 5)


def _present_on_both_sides(field: str, saved: dict, live: dict) -> bool:
    if field == "category.gender":
        return saved["category"].get("gender") is not None and live["category"].get("gender") is not None
    if field == "sleeve.include":
        return saved.get("sleeve") is not None and live.get("sleeve") is not None
    if field == "neck.include":
        return saved.get("neck") is not None and live.get("neck") is not None
    if field == "rating":
        return saved.get("rating") is not None and live.get("rating") is not None
    if field == "occasion":
        return saved.get("occasion") is not None and live.get("occasion") is not None
    return True  # every other field is required on Constraints, always present


def _distance_for_field(field: str, saved: dict, live: dict) -> float:
    if field == "category.articleType":
        return _exact_distance(saved["category"]["articleType"], live["category"]["articleType"])
    if field == "category.gender":
        return _exact_distance(saved["category"].get("gender"), live["category"].get("gender"))
    if field == "brand.include":
        return _jaccard(saved["brand"]["include"], live["brand"]["include"])
    if field == "price":
        return _price_distance(saved["price"], live["price"])
    if field == "fabric.include":
        return _jaccard(saved["fabric"]["include"], live["fabric"]["include"])
    if field == "color.include":
        return _jaccard(saved["color"]["include"], live["color"]["include"])
    if field == "size.include":
        return _jaccard(saved["size"]["include"], live["size"]["include"])
    if field == "sleeve.include":
        return _jaccard(saved["sleeve"]["include"], live["sleeve"]["include"])
    if field == "neck.include":
        return _jaccard(saved["neck"]["include"], live["neck"]["include"])
    if field == "rating":
        return _rating_distance(saved["rating"], live["rating"])
    if field == "occasion":
        return _exact_distance(saved.get("occasion"), live.get("occasion"))
    raise ValueError(f"Unknown drift field: {field}")


def compute_drift(saved: Constraints, live: Constraints) -> tuple[float, dict[str, float]]:
    saved_d = saved.model_dump()
    live_d = live.model_dump()

    contributions: dict[str, float] = {}
    total_weight_present = 0.0
    weighted_sum = 0.0

    for field, weight in WEIGHTS.items():
        if not _present_on_both_sides(field, saved_d, live_d):
            continue
        delta = _distance_for_field(field, saved_d, live_d)
        contributions[field] = round(delta * weight, 4)
        weighted_sum += delta * weight
        total_weight_present += weight

    drift_score = weighted_sum / total_weight_present if total_weight_present > 0 else 0.0
    return drift_score, contributions


def decide(drift_score: float) -> str:
    if drift_score >= TAU_HIGH:
        return "new_profile"
    if drift_score >= TAU_LOW:
        return "new_version"
    return "update"


def deterministic_reason(contributions: dict[str, float], decision: str) -> str:
    phrase = DECISION_PHRASES[decision]
    if not contributions:
        return f"No comparable fields changed — {phrase}."
    top_field = max(contributions, key=lambda f: contributions[f])
    top_value = contributions[top_field]
    return f"{top_field} changed the most ({top_value} of the signal) — {phrase}."
