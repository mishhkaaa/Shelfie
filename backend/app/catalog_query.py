"""Shared catalog filter-condition builder, reused by both /coverage and
/diff (master prompt Part 2, Section 4.3 — "don't do this by loading the
whole table into Python and filtering in memory," and both endpoints must
build conditions the same way, not two parallel implementations).

Every condition here targets an indexed Product column: article_type,
brand, and price all have a plain btree index; sizes has a GIN index for
the array-overlap (`&&`) query used by size.include.
"""

from typing import Optional

from .models import Product
from .schemas import Constraints

# category.articleType is NOT in this list — it defines the base "what kind
# of product" query, not a filter a coverage advisor should suggest removing
# (master prompt doesn't say this explicitly, but suggesting "drop the
# category" is not a meaningful relaxation the way "drop the color filter" is).
RELAXABLE_FIELDS = [
    "price",
    "brand.include",
    "fabric.include",
    "color.include",
    "size.include",
    "sleeve.include",
    "neck.include",
    "occasion",
]

ALL_FIELDS = ["category.articleType", *RELAXABLE_FIELDS]


def _condition_for_field(field: str, constraints: Constraints):
    """A single field's condition, or None if that field isn't populated on
    `constraints` (mirrors drift.py's present_on_both_sides pattern)."""
    if field == "category.articleType":
        return Product.article_type == constraints.category.articleType
    if field == "price":
        if constraints.price.min <= 0 and constraints.price.max <= 0:
            return None
        return Product.price.between(constraints.price.min, constraints.price.max)
    if field == "brand.include":
        if not constraints.brand.include:
            return None
        return Product.brand.in_(constraints.brand.include)
    if field == "fabric.include":
        if not constraints.fabric.include:
            return None
        return Product.fabric.in_(constraints.fabric.include)
    if field == "color.include":
        if not constraints.color.include:
            return None
        return Product.primary_color.in_(constraints.color.include)
    if field == "size.include":
        if not constraints.size.include:
            return None
        return Product.sizes.overlap(constraints.size.include)
    if field == "sleeve.include":
        if not constraints.sleeve or not constraints.sleeve.include:
            return None
        return Product.sleeve.in_(constraints.sleeve.include)
    if field == "neck.include":
        if not constraints.neck or not constraints.neck.include:
            return None
        return Product.neck.in_(constraints.neck.include)
    if field == "occasion":
        if not constraints.occasion:
            return None
        return Product.occasion == constraints.occasion
    raise ValueError(f"Unknown catalog field: {field}")


def populated_fields(constraints: Constraints) -> list[str]:
    return [f for f in ALL_FIELDS if _condition_for_field(f, constraints) is not None]


def build_conditions(
    constraints: Constraints,
    exclude_field: Optional[str] = None,
    global_exclusions: Optional[dict] = None,
) -> list:
    """Active conditions for `constraints`, optionally skipping one field
    (coverage's relaxation check) and always applying persona-level global
    exclusions (Tier 3, master prompt Part 2 Section 5.2) as negative
    filters that stay in effect regardless of which field is being relaxed."""
    conditions = []
    for field in ALL_FIELDS:
        if field == exclude_field:
            continue
        cond = _condition_for_field(field, constraints)
        if cond is not None:
            conditions.append(cond)

    if global_exclusions:
        if global_exclusions.get("brand"):
            conditions.append(~Product.brand.in_(global_exclusions["brand"]))
        if global_exclusions.get("fabric"):
            conditions.append(~Product.fabric.in_(global_exclusions["fabric"]))
        if global_exclusions.get("color"):
            conditions.append(~Product.primary_color.in_(global_exclusions["color"]))

    return conditions
