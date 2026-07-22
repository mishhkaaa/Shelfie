import type { Constraints } from "../api/types";

// Helper to extract the core path, e.g., "men-sneakers" from /men-sneakers.
// Deliberately NOT replaced by Myntra's "Categories" facet (e.g. "Sports
// Shoes") even though that's a more human-readable, brand-independent label —
// articleType doubles as the actual URL path segment in
// buildUrlFromConstraints below, and "Categories" facet values (like "Sports
// Shoes") are not valid Myntra path segments, so swapping it in would break
// reopening a saved profile. The "Categories" facet is instead surfaced
// separately, in Constraints.other (see NAMED_KEYS below), so both are
// visible without risking a broken URL.
function parseCategory(pathname: string, genderFacet: string[]): { articleType: string; gender?: string } {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[0] || "";
  return {
    articleType: slug, // we'll use the whole slug as articleType for now
    gender: genderFacet[0],
  };
}

// Splits the raw `f=` query value into every facet key -> value list it
// contains, keyed exactly as Myntra names them (e.g. "Fabric Types", not
// "Fabric" — a real mismatch that silently dropped every fabric filter until
// this fix). Named Constraints fields are pulled out of this map in
// parseUrlToConstraints; anything left over goes into Constraints.other so a
// multi-filter search never silently loses data just because we haven't
// modeled that particular facet by name (Myntra exposes 20+ facets per
// category — Length, Fashion Trends, Pattern, etc. — and hand-adding a typed
// field for every single one isn't worth it before the deadline).
function parseAllFilters(fStr: string): Record<string, string[]> {
  if (!fStr) return {};

  const decodedF = decodeURIComponent(fStr.replace(/\+/g, " "));
  const parts = decodedF.split("::");
  const result: Record<string, string[]> = {};

  for (const part of parts) {
    const sepIndex = part.indexOf(":");
    if (sepIndex === -1) continue;
    const key = part.substring(0, sepIndex);
    const values = part
      .substring(sepIndex + 1)
      .split(",")
      .filter(Boolean);
    if (values.length) result[key] = values;
  }

  return result;
}

// Facets we model with a dedicated, weighted Constraints field. Both
// spellings of the fabric facet are accepted since different Myntra category
// pages use different keys. "Categories" is NOT in this set on purpose — it
// falls through to `other` so the user can see it alongside the
// pathname-derived `category.articleType` instead of being silently dropped
// (see parseCategory's comment for why it isn't used AS articleType).
const NAMED_KEYS = new Set([
  "Brand",
  "Fabric Types",
  "Fabric",
  "Sleeve",
  "Neck",
  "Size",
  "Color",
  "Occasions",
  "Gender",
]);

export function parseUrlToConstraints(url: string): Constraints {
  const u = new URL(url);
  const params = u.searchParams;

  const f = params.get("f") || "";
  // const _rf = params.get("rf") || "";

  const allFilters = parseAllFilters(f);

  const fabricValues = allFilters["Fabric Types"] ?? allFilters["Fabric"] ?? [];
  // Occasions is a comma-separated multi-select facet on Myntra, but
  // Constraints.occasion is a single string field (matches the real type in
  // api/types.ts) — join multi-selections into one comma-joined string so no
  // selection is silently dropped, and round-trip losslessly in
  // buildUrlFromConstraints below.
  const occasionValues = allFilters["Occasions"] ?? [];

  const other: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(allFilters)) {
    if (!NAMED_KEYS.has(key)) other[key] = values;
  }

  return {
    category: parseCategory(u.pathname, allFilters["Gender"] ?? []),
    price: { min: 0, max: 0 }, // We will hook up price via 'rf' later when we know the exact format
    brand: {
      include: allFilters["Brand"] ?? [],
      exclude: [],
    },
    fabric: { include: fabricValues },
    sleeve: { include: allFilters["Sleeve"] ?? [] },
    neck: { include: allFilters["Neck"] ?? [] },
    size: { include: allFilters["Size"] ?? [] },
    color: {
      include: allFilters["Color"] ?? [],
      exclude: [],
    },
    occasion: occasionValues.length ? occasionValues.join(",") : undefined,
    other: Object.keys(other).length ? other : undefined,
  };
}

export function buildUrlFromConstraints(c: Constraints): string {
  const base = `https://www.myntra.com/${c.category.articleType}`;
  const params = new URLSearchParams();

  const fParts: string[] = [];
  if (c.category.gender) fParts.push(`Gender:${c.category.gender}`);
  if (c.brand.include.length) fParts.push(`Brand:${c.brand.include.join(",")}`);
  if (c.fabric.include.length) fParts.push(`Fabric Types:${c.fabric.include.join(",")}`);
  if (c.sleeve?.include.length) fParts.push(`Sleeve:${c.sleeve.include.join(",")}`);
  if (c.neck?.include.length) fParts.push(`Neck:${c.neck.include.join(",")}`);
  if (c.size.include.length) fParts.push(`Size:${c.size.include.join(",")}`);
  if (c.color.include.length) fParts.push(`Color:${c.color.include.join(",")}`);
  if (c.occasion) fParts.push(`Occasions:${c.occasion}`);
  if (c.other) {
    for (const [key, values] of Object.entries(c.other)) {
      if (values?.length) fParts.push(`${key}:${values.join(",")}`);
    }
  }

  if (fParts.length > 0) {
    // Myntra uses :: to separate different filter keys
    params.set("f", fParts.join("::"));
  }

  return `${base}?${params.toString()}`;
}

export function constraintsEqual(a: Constraints, b: Constraints): boolean {
  return JSON.stringify(a) === JSON.stringify(b); // Simple deep equality for MVP
}
