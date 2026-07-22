"""Shared display-label helpers used by both /profiles and /discover.

There is no username system (master prompt Part 2, Section 2.2 explicitly
says not to build one) — an owner label is just a deterministic, anonymous
stand-in derived from the account id.
"""

from typing import Optional

from sqlalchemy.orm import Session

from .models import Persona, Profile


def owner_label_for_account(account_id: str) -> str:
    return f"Shopper-{account_id[:8]}"


def owner_label_for_profile(db: Session, profile_id: str) -> Optional[str]:
    """None if the profile no longer exists (e.g. the source of a fork was
    later archived) — callers should omit the field rather than error."""
    row = (
        db.query(Persona.account_id)
        .join(Profile, Profile.persona_id == Persona.persona_id)
        .filter(Profile.profile_id == profile_id)
        .first()
    )
    if row is None:
        return None
    return owner_label_for_account(row[0])
