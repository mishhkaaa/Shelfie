"""Event fold / projection logic (master prompt Section 5).

This is the single place "current state" or "state at version N" gets computed.
Every endpoint that needs profile state calls `project()` — there is
deliberately no second way of deriving state anywhere else in this codebase.
"""

from typing import Any, Optional

from .models import Event

ProfileState = dict[str, Any]


def events_up_to_commit_of(events: list[Event], target_version: int) -> list[Event]:
    """Prefix of `events` ending at (and including) the ProfileCreated/
    VersionCommitted event that produced `target_version`. Scans forward and
    stops at the *first* match, so version numbers must never be reused across
    a profile's lifetime (see next_version_number in routers/profiles.py,
    which guarantees this by tracking the historical max, not the currently
    projected version)."""
    prefix: list[Event] = []
    for event in events:
        prefix.append(event)
        if event.type == "ProfileCreated" and target_version == 1:
            return prefix
        if event.type == "VersionCommitted" and event.payload.get("version") == target_version:
            return prefix
    raise ValueError(f"No commit found for version {target_version}")


def apply(state: Optional[ProfileState], event: Event, events_so_far: list[Event]) -> ProfileState:
    if event.type == "ProfileCreated":
        return {
            "constraints": event.payload["constraints"],
            "version": 1,
            "name": event.payload["name"],
            "archived": False,
            "label": event.payload.get("label"),
        }
    if event.type == "VersionCommitted":
        assert state is not None
        return {
            **state,
            "constraints": event.payload["constraints"],
            "version": event.payload["version"],
            "label": event.payload.get("label"),
        }
    if event.type == "RolledBack":
        target_prefix = events_up_to_commit_of(events_so_far, event.payload["toVersion"])
        replayed = project(target_prefix)
        assert replayed is not None
        return {**replayed, "archived": state["archived"] if state else False}
    if event.type == "ProfileArchived":
        assert state is not None
        return {**state, "archived": True}
    raise ValueError(f"Unknown event type: {event.type}")


def project(events: list[Event]) -> Optional[ProfileState]:
    """Fold a profile's events (already sorted by seq) into its current state."""
    state: Optional[ProfileState] = None
    for i, event in enumerate(events):
        state = apply(state, event, events[:i])
    return state
