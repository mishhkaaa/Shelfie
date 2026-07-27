import type { Constraints } from "../api/types";
import { buildBareUrlFromConstraints } from "../adapter/urlSchema";
import { navigateCurrentPageTo } from "../adapter/navigate";
import { buildFilterTargets, readFilterGroups, resolveFilters } from "./myntraFilterSchema";

const STORAGE_KEY = "shelfie_retry_apply";
const MAX_ATTEMPTS = 5;
// How long to wait for a page to prove itself "no results" before assuming
// it's fine — covers the case where the failure never touches the search
// gateway at all (see DOM_CHECK_DELAY_MS below) and there's nothing else to
// wait on.
const DOM_CHECK_DELAY_MS = 1500;

// Drop order when a combination returns zero results: least-confident /
// most-likely-to-be-wrong fields first. `other` goes first since those
// keys/values are free-form and least vetted of all; category.articleType
// is never dropped, since without it there's no page to be on at all.
// Dropping a field here no longer means "Myntra rejected this facet key"
// (myntraFilterSchema.ts only ever resolves a target to a key/value Myntra
// itself reported as real, for this exact category) — it now means "this
// exact combination of real filters has no matching products", so
// broadening by dropping the least-confident one first is still the right
// recovery.
const DROP_ORDER: Array<(c: Constraints) => Constraints> = [
  (c) => ({ ...c, other: undefined }),
  (c) => ({ ...c, fabric: { include: [] } }),
  (c) => ({ ...c, sleeve: { include: [] } }),
  (c) => ({ ...c, neck: { include: [] } }),
  (c) => ({ ...c, size: { include: [] } }),
  (c) => ({ ...c, occasion: undefined }),
  (c) => ({ ...c, brand: { ...c.brand, include: [] } }),
  (c) => ({ ...c, color: { ...c.color, include: [] } }),
];

// "bare" = just landed on the category+price-only URL and still needs its
// other facets resolved against the real schema and re-navigated; "resolved"
// = just landed on that fully-resolved URL, now watch it for zero results.
type Phase = "bare" | "resolved";

interface RetryState {
  constraints: Constraints;
  attempt: number;
  phase: Phase;
}

function readState(): RetryState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeState(state: RetryState | null): void {
  if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  else sessionStorage.removeItem(STORAGE_KEY);
}

// Myntra's own "no results" page (both a real 404 and its in-app "We
// couldn't find any matches!" empty-state) never renders the normal product
// grid — detecting the grid's absence plus one of Myntra's own visible
// empty-state strings is a DOM-based signal that catches failures the
// network interceptor can't see (a request that 404s before the app ever
// calls the search gateway has no JSON response to inspect at all).
function pageLooksLikeNoResults(): boolean {
  const bodyText = document.body.innerText || "";
  const hasEmptyStateText = /couldn.?t find any matches|no results found|page not found/i.test(bodyText);
  if (!hasEmptyStateText) return false;
  // Cheap corroboration so a stray match of that phrase elsewhere on a real
  // results page doesn't false-positive: a real listing page always has
  // several product links/images; an empty-state page has effectively none.
  const productLikeNodes = document.querySelectorAll('a[href*="/p/"], img[src*="assets.myntassets.com"]');
  return productLikeNodes.length === 0;
}

function buildResolvedUrl(c: Constraints, groups: ReturnType<typeof readFilterGroups>): string {
  const bareUrl = buildBareUrlFromConstraints(c);
  const resolved = resolveFilters(groups, buildFilterTargets(c));
  if (resolved.length === 0) return bareUrl;

  const u = new URL(bareUrl);
  const fParts = resolved.map((r) => `${r.groupId}:${r.valueId}`);
  u.searchParams.set("f", fParts.join("::"));
  return u.toString();
}

// Applies constraints: navigates to the bare category+price page first (the
// only two facets confirmed to serialize the same way everywhere — see
// urlSchema.ts). resumeRetryIfPending picks this up on the next page load,
// reads Myntra's own embedded filter schema there, and re-navigates once
// more to the fully-resolved URL.
export function applyWithRetry(constraints: Constraints): void {
  writeState({ constraints, attempt: 0, phase: "bare" });
  navigateCurrentPageTo(buildBareUrlFromConstraints(constraints));
}

// Watches the fully-resolved page for zero results — via the search
// gateway's own reported count, or a DOM-based fallback for requests that
// never reach the gateway at all — and drops the next-least-confident
// filter and retries (back through the bare -> resolved flow, since the
// schema may look different once a facet's removed) up to MAX_ATTEMPTS,
// instead of silently leaving the user on a dead page.
function armZeroResultWatcher(state: RetryState, onGiveUp: (constraints: Constraints) => void): void {
  let settled = false;

  const retryOrGiveUp = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener("shelfie:gateway-result", gatewayHandler);
    clearTimeout(domCheckTimer);

    if (state.attempt >= MAX_ATTEMPTS - 1 || state.attempt >= DROP_ORDER.length) {
      writeState(null);
      onGiveUp(state.constraints);
      return;
    }

    const next = DROP_ORDER[state.attempt](state.constraints);
    writeState({ constraints: next, attempt: state.attempt + 1, phase: "bare" });
    navigateCurrentPageTo(buildBareUrlFromConstraints(next));
  };

  const succeed = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener("shelfie:gateway-result", gatewayHandler);
    clearTimeout(domCheckTimer);
    writeState(null);
  };

  const gatewayHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ url: string; resultCount: number | null }>).detail;
    if (detail.resultCount === null) return; // couldn't parse this response — not a signal either way
    if (detail.resultCount > 0) succeed();
    else retryOrGiveUp();
  };
  window.addEventListener("shelfie:gateway-result", gatewayHandler);

  // Independent DOM-based check — covers navigations that never call the
  // search gateway at all (a hard 404 short-circuits before that).
  const domCheckTimer = setTimeout(() => {
    if (pageLooksLikeNoResults()) retryOrGiveUp();
    else succeed();
  }, DOM_CHECK_DELAY_MS);
}

// Called once on every page load (from mount.ts) — resumes a retry in
// progress, or does nothing if this load wasn't the result of
// applyWithRetry. Myntra's filter schema is rendered server-side into the
// initial HTML (see myntraFilterSchema.ts) and this bundle only runs at
// document_idle (manifest.json), so it's already there — no waiting needed,
// unlike the DOM-click approach this replaced.
export function resumeRetryIfPending(onGiveUp: (constraints: Constraints) => void): void {
  const state = readState();
  if (!state) return;

  if (state.phase === "bare") {
    const groups = readFilterGroups();
    const finalUrl = buildResolvedUrl(state.constraints, groups);
    const resolvedState = { ...state, phase: "resolved" as const };

    // Nothing resolved to add (e.g. every facet was already dropped down to
    // just category+price) — navigating to an identical URL wouldn't
    // trigger a new page load, so mount.ts's resumeRetryIfPending would
    // never fire again to pick up the "resolved" phase. Stay on this page
    // and watch it directly instead.
    if (finalUrl === window.location.href) {
      writeState(resolvedState);
      armZeroResultWatcher(resolvedState, onGiveUp);
      return;
    }

    writeState(resolvedState);
    navigateCurrentPageTo(finalUrl);
    return;
  }

  armZeroResultWatcher(state, onGiveUp);
}
