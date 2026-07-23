import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..ai.describe_profile import describe_profile
from ..ai.drift_phrasing import phrase_drift_reason
from ..config import TWILIO_TO_NUMBER
from ..db import get_db
from ..deps import get_account_id
from ..drift import compute_drift, decide, deterministic_reason
from ..integrations.twilio_client import send_whatsapp_message
from ..models import Event, Persona, Profile
from ..profile_ops import (
    events_for as _events_for,
    get_owned_profile as _get_owned_profile,
    next_seq as _next_seq,
    next_version_number as _next_version_number,
    to_out as _to_out,
)
from ..projection import project
from ..schemas import (
    CommitRequest,
    CommitResponse,
    Constraints,
    DriftRequest,
    DriftResponse,
    ProfileCreate,
    ProfileVersionOut,
    RollbackRequest,
    ShareRequest,
    ShareResponse,
    VisibilityRequest,
)

router = APIRouter(tags=["profiles"])


def _get_shareable_profile(db: Session, profile_id: str, account_id: str) -> Profile:
    """Shareable if you own it (any visibility — sharing over WhatsApp is a
    separate concept from the platform's own public/private toggle) OR it's
    someone else's public profile you found via Discover."""
    profile = db.get(Profile, profile_id)
    if profile is None or profile.archived:
        raise HTTPException(status_code=404, detail="Profile not found")
    owner_persona = db.get(Persona, profile.persona_id)
    is_owner = owner_persona is not None and owner_persona.account_id == account_id
    if not is_owner and profile.visibility != "public":
        raise HTTPException(status_code=403, detail="This profile is not shareable")
    return profile


@router.get("/profiles")
def list_profiles(
    personaId: str,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    persona = db.get(Persona, personaId)
    if persona is None or persona.account_id != account_id:
        raise HTTPException(status_code=404, detail="Persona not found")

    profiles = (
        db.query(Profile)
        .filter(Profile.persona_id == personaId, Profile.archived.is_(False))
        .order_by(Profile.created_at)
        .all()
    )
    out = []
    for profile in profiles:
        events = _events_for(db, profile.profile_id)
        state = project(events)
        if state is None or state.get("archived"):
            continue
        out.append(_to_out(db, profile, state, events))
    return {"profiles": out}


@router.get("/profiles/{profile_id}", response_model=ProfileVersionOut)
def get_profile(
    profile_id: str,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    profile = _get_owned_profile(db, profile_id, account_id)
    events = _events_for(db, profile_id)
    state = project(events)
    if state is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _to_out(db, profile, state, events)


@router.post("/profiles", response_model=ProfileVersionOut)
def create_profile(
    body: ProfileCreate,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    persona = db.get(Persona, body.personaId)
    if persona is None or persona.account_id != account_id:
        raise HTTPException(status_code=404, detail="Persona not found")

    profile_id = f"profile_{uuid.uuid4().hex}"
    profile = Profile(profile_id=profile_id, persona_id=body.personaId, name=body.name, current_version=1)
    db.add(profile)
    db.flush()
    db.add(
        Event(
            profile_id=profile_id,
            seq=1,
            type="ProfileCreated",
            payload={"name": body.name, "constraints": body.constraints.model_dump()},
        )
    )
    db.commit()

    events = _events_for(db, profile_id)
    state = project(events)
    assert state is not None
    return _to_out(db, profile, state, events)


@router.delete("/profiles/{profile_id}")
def delete_profile(
    profile_id: str,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    profile = _get_owned_profile(db, profile_id, account_id)
    events = _events_for(db, profile_id)

    db.add(Event(profile_id=profile_id, seq=_next_seq(events), type="ProfileArchived", payload={}))
    profile.archived = True
    db.commit()
    return {"archived": True}


@router.patch("/profiles/{profile_id}/visibility", response_model=ProfileVersionOut)
def set_profile_visibility(
    profile_id: str,
    body: VisibilityRequest,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    profile = _get_owned_profile(db, profile_id, account_id)
    profile.visibility = body.visibility
    db.commit()

    events = _events_for(db, profile_id)
    state = project(events)
    assert state is not None
    return _to_out(db, profile, state, events)


@router.post("/profiles/{profile_id}/drift", response_model=DriftResponse)
def profile_drift(
    profile_id: str,
    body: DriftRequest,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    _get_owned_profile(db, profile_id, account_id)
    state = project(_events_for(db, profile_id))
    if state is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    saved_constraints = Constraints(**state["constraints"])
    drift_score, contributions = compute_drift(saved_constraints, body.liveConstraints)
    decision = decide(drift_score)
    reason = deterministic_reason(contributions, decision)

    ai_reason = phrase_drift_reason(contributions, decision)
    if ai_reason:
        reason = ai_reason

    return DriftResponse(decision=decision, reason=reason, fieldContributions=contributions)


@router.post("/profiles/{profile_id}/commit", response_model=CommitResponse)
def profile_commit(
    profile_id: str,
    body: CommitRequest,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    profile = _get_owned_profile(db, profile_id, account_id)
    events = _events_for(db, profile_id)
    state = project(events)
    if state is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    if body.mode == "new_profile":
        if not body.name:
            raise HTTPException(status_code=400, detail="name is required for mode=new_profile")
        new_profile_id = f"profile_{uuid.uuid4().hex}"
        new_profile = Profile(
            profile_id=new_profile_id,
            persona_id=profile.persona_id,
            name=body.name,
            current_version=1,
        )
        db.add(new_profile)
        db.flush()
        db.add(
            Event(
                profile_id=new_profile_id,
                seq=1,
                type="ProfileCreated",
                payload={"name": body.name, "constraints": body.constraints.model_dump()},
            )
        )
        db.commit()
        return CommitResponse(profileId=new_profile_id, version=1, isNewProfile=True)

    version: int = state["version"] if body.mode == "update" else _next_version_number(events)

    # `name` doubles as an optional version label for new_version/update
    # (added after user feedback: version history should support naming a
    # version, not just showing v1/v2/v3) — no new request field needed since
    # CommitRequest.name already existed for the new_profile case.
    db.add(
        Event(
            profile_id=profile_id,
            seq=_next_seq(events),
            type="VersionCommitted",
            payload={
                "constraints": body.constraints.model_dump(),
                "version": version,
                "label": body.name,
            },
        )
    )
    profile.current_version = version
    db.commit()

    return CommitResponse(profileId=profile_id, version=version, isNewProfile=False)


@router.post("/profiles/{profile_id}/rollback", response_model=ProfileVersionOut)
def profile_rollback(
    profile_id: str,
    body: RollbackRequest,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    profile = _get_owned_profile(db, profile_id, account_id)
    events = _events_for(db, profile_id)
    if project(events) is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    db.add(
        Event(
            profile_id=profile_id,
            seq=_next_seq(events),
            type="RolledBack",
            payload={"toVersion": body.targetVersion},
        )
    )
    db.commit()

    events = _events_for(db, profile_id)
    new_state = project(events)
    assert new_state is not None
    profile.current_version = new_state["version"]
    db.commit()

    return _to_out(db, profile, new_state, events)


@router.post("/profiles/{profile_id}/share", response_model=ShareResponse)
def share_profile(
    profile_id: str,
    body: ShareRequest,
    account_id: str = Depends(get_account_id),
    db: Session = Depends(get_db),
):
    profile = _get_shareable_profile(db, profile_id, account_id)
    state = project(_events_for(db, profile_id))
    if state is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    constraints = Constraints(**state["constraints"])
    name = state.get("name") or profile.name
    description = describe_profile(constraints)

    message = f'🛍️ *{name}*\n{description}\n\n{body.myntraLink}\n\n— shared via Shelfie'

    to_number = body.toNumber or TWILIO_TO_NUMBER
    if not to_number:
        return ShareResponse(sent=False, message=message, detail="No phone number given and no default configured.")

    sent, detail = send_whatsapp_message(to_number, message)
    return ShareResponse(sent=sent, message=message, detail=detail)
