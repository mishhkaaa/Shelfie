import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..ai.rank_profiles import rank_profiles
from ..db import get_db
from ..deps import get_account_id
from ..labels import owner_label_for_account
from ..models import Event, Persona, Profile, Star
from ..profile_ops import events_for, to_out
from ..projection import project
from ..schemas import (
    Constraints,
    DiscoverItem,
    DiscoverResponse,
    DiscoverSearchRequest,
    DiscoverSearchResponse,
    ForkRequest,
    ProfileVersionOut,
    StarResponse,
)

router = APIRouter(tags=["discover"])


def _star_count(db: Session, profile_id: str) -> int:
    return db.query(func.count(Star.account_id)).filter(Star.profile_id == profile_id).scalar() or 0


def _fork_count(db: Session, profile_id: str) -> int:
    return db.query(func.count(Profile.profile_id)).filter(Profile.forked_from_profile_id == profile_id).scalar() or 0


def _get_public_profile(db: Session, profile_id: str) -> Profile:
    profile = db.get(Profile, profile_id)
    if profile is None or profile.archived or profile.visibility != "public":
        # 403, not 404 — the profile may well exist, it's just not visible to
        # anyone but its owner (master prompt Part 2, Section 6 definition of
        # done: private profiles must be genuinely inaccessible, not just
        # hidden client-side).
        raise HTTPException(status_code=403, detail="This profile is not public")
    return profile


def _build_discover_feed(db: Session, account_id: str, limit: int, offset: int) -> list[DiscoverItem]:
    profiles = (
        db.query(Profile)
        .filter(Profile.visibility == "public", Profile.archived.is_(False))
        .order_by(Profile.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    my_starred_ids = {
        row[0]
        for row in db.query(Star.profile_id).filter(Star.account_id == account_id).all()
    }

    items: list[DiscoverItem] = []
    for profile in profiles:
        events = events_for(db, profile.profile_id)
        state = project(events)
        if state is None or state.get("archived"):
            continue

        persona = db.get(Persona, profile.persona_id)
        owner_label = owner_label_for_account(persona.account_id) if persona else "Shopper-unknown"

        items.append(
            DiscoverItem(
                profileId=profile.profile_id,
                name=state.get("name") or profile.name,
                versionLabel=state.get("label"),
                ownerLabel=owner_label,
                starsCount=_star_count(db, profile.profile_id),
                forksCount=_fork_count(db, profile.profile_id),
                constraints=Constraints(**state["constraints"]),
                createdAt=profile.created_at.isoformat() if profile.created_at else None,
                starredByMe=profile.profile_id in my_starred_ids,
            )
        )

    # Time-decayed score (master prompt Part 2, Section 2.2) so early-popular
    # decks don't dominate forever — computed here at request time, never
    # stored, so it always reflects the current star count and current age.
    def score(item: DiscoverItem) -> float:
        if not item.createdAt:
            return 0.0
        created = datetime.fromisoformat(item.createdAt)
        age_hours = max((datetime.now(timezone.utc) - created).total_seconds() / 3600, 0)
        return item.starsCount / (age_hours + 2) ** 1.5

    items.sort(key=score, reverse=True)

    return items


@router.get("/discover", response_model=DiscoverResponse)
def discover_feed(
    limit: int = 20,
    offset: int = 0,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    return DiscoverResponse(profiles=_build_discover_feed(db, account_id, limit, offset))


@router.post("/discover/search", response_model=DiscoverSearchResponse)
def discover_search(
    body: DiscoverSearchRequest,
    limit: int = 50,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    """Semantic re-ranking of the public feed against a free-text sentence,
    via Groq (see ai/rank_profiles.py) — a genuine understanding-based
    match (synonyms, related concepts), not just string/stem overlap. The
    extension already has a fast client-side stemmed-word ranking it shows
    immediately; this endpoint's result replaces that ordering once it
    resolves, so a slow/unavailable Groq call never blocks the search."""
    feed = _build_discover_feed(db, account_id, limit, 0)
    if not body.sentence.strip():
        return DiscoverSearchResponse(rankedProfileIds=None)

    ranked = rank_profiles(body.sentence, [item.model_dump() for item in feed])
    return DiscoverSearchResponse(rankedProfileIds=ranked)


@router.post("/discover/{profile_id}/star", response_model=StarResponse)
def toggle_star(
    profile_id: str,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    _get_public_profile(db, profile_id)

    existing = db.get(Star, {"account_id": account_id, "profile_id": profile_id})
    if existing is not None:
        db.delete(existing)
        starred = False
    else:
        db.add(Star(account_id=account_id, profile_id=profile_id))
        starred = True
    db.commit()

    return StarResponse(starred=starred, starsCount=_star_count(db, profile_id))


@router.post("/discover/{profile_id}/fork", response_model=ProfileVersionOut)
def fork_profile(
    profile_id: str,
    body: ForkRequest,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    source_profile = _get_public_profile(db, profile_id)
    source_state = project(events_for(db, profile_id))
    if source_state is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    persona = db.get(Persona, body.personaId)
    if persona is None or persona.account_id != account_id:
        raise HTTPException(status_code=404, detail="Persona not found")

    # A fork is a read of the source's projected state, then a write to a
    # brand-new, independent aggregate — never a write to the source
    # profile's own event log, and never a shared row between the two
    # (master prompt Part 2, Section 2.2).
    new_profile_id = f"profile_{uuid.uuid4().hex}"
    new_profile = Profile(
        profile_id=new_profile_id,
        persona_id=body.personaId,
        name=body.name,
        current_version=1,
        forked_from_profile_id=source_profile.profile_id,
        forked_from_version=source_state["version"],
    )
    db.add(new_profile)
    db.flush()

    # ProfileCreated's payload already supports an optional "label" (used by
    # projection.apply for version history) — reuse it here instead of
    # appending a redundant second VersionCommitted event for the same v1.
    db.add(
        Event(
            profile_id=new_profile_id,
            seq=1,
            type="ProfileCreated",
            payload={
                "name": body.name,
                "constraints": source_state["constraints"],
                "label": f"Forked from {source_profile.name} v{source_state['version']}",
            },
        )
    )
    db.commit()

    events = events_for(db, new_profile_id)
    state = project(events)
    assert state is not None
    return to_out(db, new_profile, state, events)
