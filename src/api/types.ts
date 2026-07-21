export interface Constraints {
  category: {
    articleType: string;
    gender?: string;
  };
  price: { min: number; max: number };
  brand: { include: string[]; exclude: string[] };
  fabric: { include: string[] };
  sleeve?: { include: string[] };
  size: { include: string[] };
  color: { include: string[]; exclude: string[] };
  rating?: { min: number };
  occasion?: string;
}

export interface ProfileVersion {
  id: string;
  name: string;
  version: number;
  personaId: string;
  constraints: Constraints;
}

export interface DriftResponse {
  decision: "new_version" | "update" | "new_profile";
  reason: string;
  fieldContributions: Record<string, number>;
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
