export interface Constraints {
  category: {
    articleType: string;
    gender?: string;
  };
  price: { min: number; max: number };
  brand: { include: string[]; exclude: string[] };
  fabric: { include: string[] };
  sleeve?: { include: string[] };
  neck?: { include: string[] };
  size: { include: string[] };
  color: { include: string[]; exclude: string[] };
  rating?: { min: number };
  occasion?: string;
  // Catch-all for Myntra facets we don't model with a dedicated weighted
  // field (Length, Fashion Trends, Pattern, etc.) — keyed exactly as Myntra
  // names them, so a multi-filter search never silently loses data just
  // because we haven't hand-added a typed field for that facet yet. Not
  // scored by the drift engine.
  other?: Record<string, string[]>;
}

export interface ProfileHistoryEntry {
  version: number;
  label?: string;
  createdAt?: string;
}

export interface ProfileVersion {
  id: string;
  name: string;
  version: number;
  personaId: string;
  constraints: Constraints;
  // Backend-only bookkeeping fields, additive per master prompt Section 3.1 —
  // safe extra fields the frontend doesn't have to read.
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
  versionLabel?: string;
  history?: ProfileHistoryEntry[];
}

export interface DriftResponse {
  decision: "new_version" | "update" | "new_profile";
  reason: string;
  fieldContributions: Record<string, number>;
}

export interface CommitResponse {
  profileId: string;
  version: number;
  isNewProfile: boolean;
}

export interface ShelfieState {
  driftResult: {
    reason: string;
    decision: "new_version" | "update" | "new_profile";
  } | null;

  setActivePersona: (id: string) => void;
  addPersona: (label: string, emoji: string) => void;
  deleteProfile: (id: string) => void;

  loadLiveConstraints: (c: Constraints) => void;
}
