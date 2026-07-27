import type { Constraints } from "../api/types";

const EMPTY_CONSTRAINTS: Constraints = {
  category: { articleType: "" },
  price: { min: 0, max: 0 },
  brand: { include: [], exclude: [] },
  fabric: { include: [] },
  size: { include: [] },
  color: { include: [], exclude: [] },
};

function mergeUnique(existing: string[] | undefined, incoming: string[] | undefined): string[] {
  return Array.from(new Set([...(existing ?? []), ...(incoming ?? [])]));
}

// Deterministic merge of a validated NL-compiler patch onto the current live
// constraints — the backend already did the propose-then-validate step
// (master prompt Part 2, Section 5.1); this just folds the result in the
// same additive way the rest of the app treats include-lists.
export function mergeConstraints(base: Constraints | null, patch: Partial<Constraints>): Constraints {
  const merged: Constraints = base ? JSON.parse(JSON.stringify(base)) : JSON.parse(JSON.stringify(EMPTY_CONSTRAINTS));

  // Guarded field-by-field rather than a blanket spread: a patch object is
  // always truthy even when its own fields are empty/zero (e.g. a gateway-
  // intercepted request that didn't carry a recognizable category or price),
  // so spreading it wholesale would silently blank out a value this merge
  // already had. Falling back to the existing value on a falsy incoming
  // field keeps this merge purely additive, never destructive.
  if (patch.category) {
    merged.category = {
      articleType: patch.category.articleType || merged.category.articleType,
      gender: patch.category.gender ?? merged.category.gender,
    };
  }
  if (patch.price) {
    merged.price = {
      min: patch.price.min || merged.price.min,
      max: patch.price.max || merged.price.max,
    };
  }
  if (patch.brand?.include) merged.brand = { ...merged.brand, include: mergeUnique(merged.brand.include, patch.brand.include) };
  if (patch.fabric?.include) merged.fabric = { include: mergeUnique(merged.fabric.include, patch.fabric.include) };
  if (patch.color?.include) merged.color = { ...merged.color, include: mergeUnique(merged.color.include, patch.color.include) };
  if (patch.sleeve?.include) merged.sleeve = { include: mergeUnique(merged.sleeve?.include, patch.sleeve.include) };
  if (patch.neck?.include) merged.neck = { include: mergeUnique(merged.neck?.include, patch.neck.include) };
  if (patch.size?.include) merged.size = { include: mergeUnique(merged.size.include, patch.size.include) };
  if (patch.occasion) merged.occasion = patch.occasion;

  return merged;
}
