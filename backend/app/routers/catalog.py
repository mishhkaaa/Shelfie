from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, not_
from sqlalchemy.orm import Session

from ..catalog_query import build_conditions, populated_fields
from ..db import get_db
from ..deps import get_account_id
from ..models import Persona, Product
from ..schemas import Constraints, CoverageResponse, CoverageSuggestion, DiffRequest, DiffResponse

router = APIRouter(tags=["catalog"])


def _global_exclusions_for(db: Session, persona_id: str) -> dict | None:
    if not persona_id:
        return None
    persona = db.get(Persona, persona_id)
    return persona.global_exclusions if persona else None


@router.post("/coverage", response_model=CoverageResponse)
def coverage(
    body: Constraints,
    personaId: str | None = None,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    exclusions = _global_exclusions_for(db, personaId) if personaId else None

    conditions = build_conditions(body, global_exclusions=exclusions)
    current_count = db.query(func.count(Product.product_id)).filter(and_(*conditions)).scalar() or 0

    suggestions: list[CoverageSuggestion] = []
    for field in populated_fields(body):
        if field == "category.articleType":
            continue  # not a relaxable field — see catalog_query.py
        relaxed_conditions = build_conditions(body, exclude_field=field, global_exclusions=exclusions)
        relaxed_count = db.query(func.count(Product.product_id)).filter(and_(*relaxed_conditions)).scalar() or 0
        gain = relaxed_count - current_count
        if gain > 0:
            suggestions.append(CoverageSuggestion(field=field, newCount=relaxed_count, gain=gain))

    suggestions.sort(key=lambda s: s.gain, reverse=True)

    return CoverageResponse(currentCount=current_count, suggestions=suggestions[:3])


@router.post("/diff", response_model=DiffResponse)
def diff(
    body: DiffRequest,
    personaId: str | None = None,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    exclusions = _global_exclusions_for(db, personaId) if personaId else None

    old_conditions = build_conditions(body.oldConstraints, global_exclusions=exclusions)
    new_conditions = build_conditions(body.newConstraints, global_exclusions=exclusions)

    old_clause = and_(*old_conditions) if old_conditions else True
    new_clause = and_(*new_conditions) if new_conditions else True

    # Set difference pushed down to SQL as AND-NOT (equivalent to EXCEPT on
    # this single table — master prompt Part 2 Section 4.3 says "EXCEPT or
    # equivalent"), never diffing two full ID lists in application code.
    added_clause = and_(new_clause, not_(old_clause))
    removed_clause = and_(old_clause, not_(new_clause))

    added_count = db.query(func.count(Product.product_id)).filter(added_clause).scalar() or 0
    removed_count = db.query(func.count(Product.product_id)).filter(removed_clause).scalar() or 0
    total_count = db.query(func.count(Product.product_id)).filter(new_clause).scalar() or 0

    added_brand_row = (
        db.query(Product.brand, func.count().label("cnt"))
        .filter(added_clause)
        .group_by(Product.brand)
        .order_by(func.count().desc())
        .first()
    )
    added_sample_brand = added_brand_row[0] if added_brand_row else None

    return DiffResponse(
        added=added_count,
        removed=removed_count,
        total=total_count,
        addedSampleBrand=added_sample_brand,
    )
