import hashlib
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_account_id
from ..drift import TAU_LOW, compute_drift
from ..models import Account, Persona, Profile, RecentSearch
from ..profile_ops import events_for
from ..projection import project
from ..schemas import AccountSettings, Constraints, ObserveRequest, ObserveResponse

router = APIRouter(tags=["behaviour"])


def _constraints_hash(constraints: Constraints) -> str:
    """Canonical hash of a constraint set: sort_keys=True guarantees the same
    logical constraints always hash the same way regardless of field order
    (master prompt Part 2, Section 3.1) — this must stay stable or duplicate
    detection in recent_searches silently breaks."""
    canonical = json.dumps(constraints.model_dump(), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


@router.get("/accounts/settings", response_model=AccountSettings)
def get_settings(account_id: str = Depends(get_account_id), db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    assert account is not None  # get_account_id dependency already created it
    return AccountSettings(behaviourTrackingEnabled=bool(account.behaviour_tracking_enabled))


@router.patch("/accounts/settings", response_model=AccountSettings)
def update_settings(
    body: AccountSettings,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    account = db.get(Account, account_id)
    assert account is not None
    account.behaviour_tracking_enabled = body.behaviourTrackingEnabled
    db.commit()
    return AccountSettings(behaviourTrackingEnabled=account.behaviour_tracking_enabled)


@router.post("/behaviour/observe", response_model=ObserveResponse)
def observe(
    body: ObserveRequest,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    persona = db.get(Persona, body.personaId)
    if persona is None or persona.account_id != account_id:
        raise HTTPException(status_code=404, detail="Persona not found")

    constraints_hash = _constraints_hash(body.constraints)
    now = datetime.now(timezone.utc)

    existing = (
        db.query(RecentSearch)
        .filter(
            RecentSearch.persona_id == body.personaId,
            RecentSearch.constraints_hash == constraints_hash,
        )
        .first()
    )

    if existing is not None:
        last_seen = existing.last_seen_at
        if last_seen is not None and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        # 10-minute cooldown: a debounced burst of near-identical calls from
        # one real browsing session only bumps last_seen_at, not seen_count,
        # so it doesn't over-count a single session as multiple visits.
        if last_seen is not None and now - last_seen < timedelta(minutes=10):
            existing.last_seen_at = now
        else:
            existing.seen_count += 1
            existing.last_seen_at = now
        db.commit()
        seen_count = existing.seen_count
    else:
        db.add(
            RecentSearch(
                persona_id=body.personaId,
                constraints_hash=constraints_hash,
                constraints=body.constraints.model_dump(),
                seen_count=1,
            )
        )
        db.commit()
        seen_count = 1

    # Suppress the suggestion if the persona already has a saved profile
    # whose drift against these constraints is below TAU_LOW — reuse the
    # existing drift engine, don't write a second similarity function.
    suppressed = False
    saved_profiles = (
        db.query(Profile).filter(Profile.persona_id == body.personaId, Profile.archived.is_(False)).all()
    )
    for profile in saved_profiles:
        state = project(events_for(db, profile.profile_id))
        if state is None:
            continue
        saved_constraints = Constraints(**state["constraints"])
        drift_score, _ = compute_drift(saved_constraints, body.constraints)
        if drift_score < TAU_LOW:
            suppressed = True
            break

    suggest = seen_count >= 3 and not suppressed
    return ObserveResponse(suggest=suggest, seenCount=seen_count)
