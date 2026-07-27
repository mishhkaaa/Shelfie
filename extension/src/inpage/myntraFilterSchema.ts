// Myntra embeds the full, authoritative facet schema for the current page
// directly in an inline `<script>window.__myx = {...}</script>` tag on
// every category page load — confirmed directly from a real captured page
// dump (not inferred/guessed this time): every real facet group's exact id
// (e.g. "Color", "size_facet", "Brand") and every one of that group's exact
// values, verbatim. Reading this is dramatically more reliable than the two
// things tried before it (guessing the `f=` key outright, then simulating
// clicks on rendered checkboxes, which turned out not to match Myntra's
// real DOM at all) — there's no DOM-timing/dropdown-opening race, and it
// can never produce an invalid key or value, since it comes straight from
// Myntra's own data for this exact page.
import type { Constraints } from "../api/types";

export interface FilterValueEntry {
  id: string;
  value: string;
  count: number;
}

export interface FilterGroup {
  id: string;
  filterValues: FilterValueEntry[];
}

export interface FilterTarget {
  field: string;
  value: string;
  // Only set for field === "other" — the exact Myntra facet key captured
  // from a previously-parsed real URL (see urlSchema.ts's `other` bucket),
  // used to look up the matching group directly instead of guessing via
  // FIELD_GROUP_HINTS.
  otherKey?: string;
}

// Same priority as retryApply.ts's old DROP_ORDER (least-confident first) —
// `other` first since those keys/values are free-form and least vetted.
export function buildFilterTargets(c: Constraints): FilterTarget[] {
  const targets: FilterTarget[] = [];

  if (c.other) {
    for (const [key, values] of Object.entries(c.other)) {
      for (const v of values ?? []) targets.push({ field: "other", value: v, otherKey: key });
    }
  }
  for (const v of c.fabric?.include ?? []) targets.push({ field: "fabric", value: v });
  for (const v of c.sleeve?.include ?? []) targets.push({ field: "sleeve", value: v });
  for (const v of c.neck?.include ?? []) targets.push({ field: "neck", value: v });
  for (const v of c.size?.include ?? []) targets.push({ field: "size", value: v });
  if (c.occasion) targets.push({ field: "occasion", value: c.occasion });
  for (const v of c.brand?.include ?? []) targets.push({ field: "brand", value: v });
  for (const v of c.color?.include ?? []) targets.push({ field: "color", value: v });
  if (c.category.gender) targets.push({ field: "gender", value: c.category.gender });

  return targets;
}

// Finds the balanced `{...}` object literal starting at/after `fromIdx`,
// tracking string state so a brace inside a quoted value is never
// miscounted — needed because a naive "find the last `}`" would break the
// moment a script has more statements after `window.__myx = {...};`.
function extractBalancedJson(text: string, fromIdx: number): string | null {
  const start = text.indexOf("{", fromIdx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function readMyxObject(): unknown | null {
  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent;
    if (!text) continue;
    const idx = text.indexOf("window.__myx");
    if (idx === -1) continue;
    const eq = text.indexOf("=", idx);
    if (eq === -1) continue;
    const json = extractBalancedJson(text, eq);
    if (!json) continue;
    try {
      return JSON.parse(json);
    } catch {
      continue;
    }
  }
  return null;
}

function collectFilterGroups(obj: unknown, seen: Set<unknown>, out: FilterGroup[]): void {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return;
  seen.add(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) collectFilterGroups(item, seen, out);
    return;
  }
  const rec = obj as Record<string, unknown>;
  if (typeof rec.id === "string" && Array.isArray(rec.filterValues)) {
    out.push(rec as unknown as FilterGroup);
  }
  for (const key of Object.keys(rec)) collectFilterGroups(rec[key], seen, out);
}

// Scoped to `searchData.results.filters` (falling back to the whole object
// if that path is missing) rather than the one confirmed array name
// (`primaryFilters`) — the "+N more" secondary facets (Fabrics, Occasions,
// Sleeve, ...) almost certainly live in a second, differently-named array
// alongside it that wasn't directly observed, so this walks generically
// for anything shaped like a filter group instead of hardcoding one path.
export function readFilterGroups(): FilterGroup[] {
  const myx = readMyxObject() as Record<string, unknown> | null;
  if (!myx) return [];
  const results = (myx.searchData as Record<string, unknown> | undefined)?.results as
    | Record<string, unknown>
    | undefined;
  const scope = results?.filters ?? myx;
  const out: FilterGroup[] = [];
  collectFilterGroups(scope, new Set(), out);
  return out;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Our internal field name -> substrings to look for in a group's real `id`
// (e.g. field "fabric" matches a group id of "Fabric", "Fabric Types", or
// "Fabrics" alike, generically, across any category) — not a fixed key,
// since the exact id genuinely varies per category.
const FIELD_GROUP_HINTS: Record<string, string[]> = {
  fabric: ["fabric"],
  sleeve: ["sleeve"],
  neck: ["neck"],
  size: ["size"],
  occasion: ["occasion"],
  brand: ["brand"],
  color: ["color", "colour"],
  gender: ["gender"],
};

function findGroup(groups: FilterGroup[], target: FilterTarget): FilterGroup | undefined {
  if (target.field === "other" && target.otherKey) {
    const exact = groups.find((g) => g.id === target.otherKey);
    if (exact) return exact;
    const n = normalize(target.otherKey);
    return groups.find((g) => normalize(g.id).includes(n) || n.includes(normalize(g.id)));
  }
  const hints = FIELD_GROUP_HINTS[target.field];
  if (!hints) return undefined;
  return groups.find((g) => {
    const n = normalize(g.id);
    return hints.some((h) => n.includes(h));
  });
}

function findValue(group: FilterGroup, value: string): FilterValueEntry | undefined {
  const target = normalize(value);
  const exact = group.filterValues.find((v) => normalize(v.value) === target || normalize(v.id) === target);
  if (exact) return exact;
  return group.filterValues.find((v) => {
    const n = normalize(v.value);
    return n.includes(target) || target.includes(n);
  });
}

export interface ResolvedFilter {
  groupId: string;
  valueId: string;
}

// Resolves each target against the real schema; anything not found (a
// field this category simply doesn't have, or a value that isn't one of
// its real options) is silently omitted rather than guessed — the whole
// point of reading real data is to never emit a key/value Myntra doesn't
// recognize.
export function resolveFilters(groups: FilterGroup[], targets: FilterTarget[]): ResolvedFilter[] {
  const resolved: ResolvedFilter[] = [];
  for (const target of targets) {
    const group = findGroup(groups, target);
    if (!group) continue;
    const value = findValue(group, target.value);
    if (!value) continue;
    resolved.push({ groupId: group.id, valueId: value.id });
  }
  return resolved;
}
