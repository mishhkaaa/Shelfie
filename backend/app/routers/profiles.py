import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..ai.drift_phrasing import phrase_drift_reason
from ..db import get_db
from ..deps import get_account_id
from ..drift import compute_drift, decide, deterministic_reason
from ..models import Event, Persona, Profile
from ..projection import ProfileState, project
from ..schemas import (
    CommitRequest,
    CommitResponse,
    Constraints,
    DriftRequest,
    DriftResponse,
    HistoryEntry,
    ProfileCreate,
    ProfileVersionOut,
    RollbackRequest,
)

router = APIRouter(tags=["profiles"])


def _get_owned_profile(db: Session, profile_id: str, account_id: str) -> Profile:
    profile = (
        db.query(Profile)
        .join(Persona, Profile.persona_id == Persona.persona_id)
        .filter(Profile.profile_id == profile_id, Persona.account_id == account_id)
        .first()
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


def _events_for(db: Session, profile_id: str) -> list[Event]:
    return db.query(Event).filter(Event.profile_id == profile_id).order_by(Event.seq).all()


def _next_seq(events: list[Event]) -> int:
    return (events[-1].seq + 1) if events else 1


def _next_version_number(events: list[Event]) -> int:
    """Highest version number ever committed, +1. Deliberately NOT
    current-projected-version + 1: after a rollback the projected version can
    go backwards, and reusing a version number would make
    projection.events_up_to_commit_of's forward-scan-to-first-match replay
    ambiguous. See BACKEND_BUILD_LOG.md kickoff entry."""
    versions = [
        1 if e.type == "ProfileCreated" else e.payload["version"]
        for e in events
        if e.type in ("ProfileCreated", "VersionCommitted")
    ]
    return (max(versions) if versions else 1) + 1


def _build_history(events: list[Event]) -> list[HistoryEntry]:
    """One entry per version number, keyed so an `update`-mode commit (which
    overwrites the same version number in place) replaces that version's
    entry rather than appending a duplicate — matches the "Update Current:
    overwrite silently" semantics from the three-way save modal."""
    by_version: dict[int, HistoryEntry] = {}
    for event in events:
        if event.type == "ProfileCreated":
            by_version[1] = HistoryEntry(
                version=1,
                label=event.payload.get("label"),
                createdAt=event.created_at.isoformat() if event.created_at else None,
            )
        elif event.type == "VersionCommitted":
            version = event.payload["version"]
            by_version[version] = HistoryEntry(
                version=version,
                label=event.payload.get("label"),
                createdAt=event.created_at.isoformat() if event.created_at else None,
            )
    return [by_version[v] for v in sorted(by_version)]


def _to_out(profile: Profile, state: ProfileState, events: list[Event]) -> ProfileVersionOut:
    return ProfileVersionOut(
        id=profile.profile_id,
        name=state.get("name") or profile.name,
        version=state["version"],
        personaId=profile.persona_id,
        constraints=Constraints(**state["constraints"]),
        createdAt=profile.created_at.isoformat() if profile.created_at else None,
        updatedAt=profile.updated_at.isoformat() if profile.updated_at else None,
        archived=bool(state.get("archived", False)),
        versionLabel=state.get("label"),
        history=_build_history(events),
    )


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
        out.append(_to_out(profile, state, events))
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
    return _to_out(profile, state, events)


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
    return _to_out(profile, state, events)


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

    return _to_out(profile, new_state, events)
