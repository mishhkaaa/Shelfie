from typing import Literal, Optional

from pydantic import BaseModel, Field


class Category(BaseModel):
    articleType: str
    gender: Optional[str] = None


class PriceRange(BaseModel):
    min: float
    max: float


class IncludeExclude(BaseModel):
    include: list[str] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)


class IncludeOnly(BaseModel):
    include: list[str] = Field(default_factory=list)


class Rating(BaseModel):
    min: float


class Constraints(BaseModel):
    """Mirrors extension/src/api/types.ts Constraints exactly (the frontend is
    the authoritative source of truth for this shape, not the master prompt's
    Section 3 draft — see BACKEND_BUILD_LOG.md kickoff entry)."""

    category: Category
    price: PriceRange
    brand: IncludeExclude
    fabric: IncludeOnly
    sleeve: Optional[IncludeOnly] = None
    neck: Optional[IncludeOnly] = None
    size: IncludeOnly
    color: IncludeExclude
    rating: Optional[Rating] = None
    occasion: Optional[str] = None
    # Catch-all for Myntra facets not modeled with a dedicated weighted field
    # (Length, Fashion Trends, Pattern, etc.) — mirrors the frontend's
    # `Constraints.other`. Not scored by the drift engine (drift.WEIGHTS only
    # iterates the named fields above), purely preserved for round-trip
    # fidelity when reopening a saved profile.
    other: Optional[dict[str, list[str]]] = None


class PersonaCreate(BaseModel):
    name: str


class PersonaOut(BaseModel):
    id: str
    name: str


class ProfileCreate(BaseModel):
    name: str
    personaId: str
    constraints: Constraints


class HistoryEntry(BaseModel):
    version: int
    label: Optional[str] = None
    createdAt: Optional[str] = None


class ProfileVersionOut(BaseModel):
    id: str
    name: str
    version: int
    personaId: str
    constraints: Constraints
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    archived: Optional[bool] = None
    versionLabel: Optional[str] = None
    history: Optional[list[HistoryEntry]] = None
    # Collaboration (master prompt Part 2, Section 2) — additive.
    visibility: Optional[Literal["private", "public"]] = None
    forkedFromProfileId: Optional[str] = None
    forkedFromVersion: Optional[int] = None
    forkedFromOwnerLabel: Optional[str] = None


class DriftRequest(BaseModel):
    liveConstraints: Constraints


class DriftResponse(BaseModel):
    decision: Literal["new_version", "update", "new_profile"]
    reason: str
    fieldContributions: dict[str, float]


class CommitRequest(BaseModel):
    mode: Literal["new_version", "update", "new_profile"]
    constraints: Constraints
    name: Optional[str] = None


class CommitResponse(BaseModel):
    profileId: str
    version: int
    isNewProfile: bool


class RollbackRequest(BaseModel):
    targetVersion: int


class SuggestNameRequest(BaseModel):
    constraints: Constraints


class SuggestNameResponse(BaseModel):
    suggestedName: Optional[str] = None
    suggestedDescription: Optional[str] = None


class VisibilityRequest(BaseModel):
    visibility: Literal["private", "public"]


class DiscoverItem(BaseModel):
    profileId: str
    name: str
    versionLabel: Optional[str] = None
    ownerLabel: str
    starsCount: int
    forksCount: int
    constraints: Constraints
    createdAt: Optional[str] = None
    starredByMe: bool = False


class DiscoverResponse(BaseModel):
    profiles: list[DiscoverItem]


class StarResponse(BaseModel):
    starred: bool
    starsCount: int


class ForkRequest(BaseModel):
    personaId: str
    name: str


class AccountSettings(BaseModel):
    behaviourTrackingEnabled: bool


class ObserveRequest(BaseModel):
    personaId: str
    constraints: Constraints


class ObserveResponse(BaseModel):
    suggest: bool
    seenCount: int


class CoverageSuggestion(BaseModel):
    field: str
    newCount: int
    gain: int


class CoverageResponse(BaseModel):
    currentCount: int
    suggestions: list[CoverageSuggestion]


class DiffRequest(BaseModel):
    oldConstraints: Constraints
    newConstraints: Constraints


class DiffResponse(BaseModel):
    added: int
    removed: int
    total: int
    addedSampleBrand: Optional[str] = None


class GlobalExclusions(BaseModel):
    brand: list[str] = Field(default_factory=list)
    fabric: list[str] = Field(default_factory=list)
    color: list[str] = Field(default_factory=list)


class GlobalExclusionsResponse(BaseModel):
    globalExclusions: GlobalExclusions


class CompileIntentRequest(BaseModel):
    sentence: str


class CompileIntentResponse(BaseModel):
    constraints: dict
    provenance: dict[str, str]
