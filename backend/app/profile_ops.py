"""Shared profile helpers used by both routers/profiles.py and
routers/discover.py. Centralized here specifically so fork (discover.py)
reuses the exact same fold/projection and version-numbering logic as the
rest of the app — master prompt Part 2, Section 2.2 and Section 0.3 both
require this: "reuse the existing fold/projection function — do not write a
second implementation" and version numbering must stay "historical max
across all events, plus one," not reimplemented per-endpoint.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .labels import owner_label_for_profile
from .models import Event, Persona, Profile
from .projection import ProfileState
from .schemas import Constraints, HistoryEntry, ProfileVersionOut


def get_owned_profile(db: Session, profile_id: str, account_id: str) -> Profile:
    profile = (
        db.query(Profile)
        .join(Persona, Profile.persona_id == Persona.persona_id)
        .filter(Profile.profile_id == profile_id, Persona.account_id == account_id)
        .first()
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


def events_for(db: Session, profile_id: str) -> list[Event]:
    return db.query(Event).filter(Event.profile_id == profile_id).order_by(Event.seq).all()


def next_seq(events: list[Event]) -> int:
    return (events[-1].seq + 1) if events else 1


def next_version_number(events: list[Event]) -> int:
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


def build_history(events: list[Event]) -> list[HistoryEntry]:
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


def to_out(db: Session, profile: Profile, state: ProfileState, events: list[Event]) -> ProfileVersionOut:
    forked_from_owner_label = (
        owner_label_for_profile(db, profile.forked_from_profile_id)
        if profile.forked_from_profile_id
        else None
    )
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
        history=build_history(events),
        visibility=profile.visibility,
        forkedFromProfileId=profile.forked_from_profile_id,
        forkedFromVersion=profile.forked_from_version,
        forkedFromOwnerLabel=forked_from_owner_label,
    )
