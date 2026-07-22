from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Account(Base):
    __tablename__ = "accounts"

    account_id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    behaviour_tracking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Persona(Base):
    __tablename__ = "personas"

    persona_id: Mapped[str] = mapped_column(String, primary_key=True)
    account_id: Mapped[str] = mapped_column(String, ForeignKey("accounts.account_id"), index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    profile_id: Mapped[str] = mapped_column(String, primary_key=True)
    persona_id: Mapped[str] = mapped_column(String, ForeignKey("personas.persona_id"), index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Collaboration (master prompt Part 2, Section 2.1) — additive columns.
    visibility: Mapped[str] = mapped_column(String, nullable=False, default="private")
    forked_from_profile_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("profiles.profile_id"), nullable=True
    )
    forked_from_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    events: Mapped[list["Event"]] = relationship(
        "Event", back_populates="profile", order_by="Event.seq"
    )


class Star(Base):
    __tablename__ = "stars"

    account_id: Mapped[str] = mapped_column(String, ForeignKey("accounts.account_id"), primary_key=True)
    profile_id: Mapped[str] = mapped_column(String, ForeignKey("profiles.profile_id"), primary_key=True)
    starred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RecentSearch(Base):
    __tablename__ = "recent_searches"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    persona_id: Mapped[str] = mapped_column(String, ForeignKey("personas.persona_id"), index=True)
    constraints_hash: Mapped[str] = mapped_column(String, nullable=False)
    constraints: Mapped[dict] = mapped_column(JSON, nullable=False)
    seen_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("persona_id", "constraints_hash", name="uq_recent_search"),)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("profile_id", "seq", name="uq_events_profile_seq"),)

    event_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    profile_id: Mapped[str] = mapped_column(String, ForeignKey("profiles.profile_id"), index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped["Profile"] = relationship("Profile", back_populates="events")
