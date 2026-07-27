import type { Constraints } from "../api/types";
import { buildBareUrlFromConstraints } from "../adapter/urlSchema";
import { navigateCurrentPageTo } from "../adapter/navigate";
import { buildClickQueue, applyClickQueue, waitForFilterSidebar } from "./applyFiltersViaDom";

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
// Unlike the old URL-guessing version, dropping a field here no longer
// means "Myntra rejected this facet key" (applyFiltersViaDom only ever
// clicks checkboxes that genuinely exist on the page) — it now means
// "this exact combination of real filters has no matching products",
// so broadening by dropping the least-confident one first is still the
// right recovery.
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

interface RetryState {
  constraints: Constraints;
  attempt: number;
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

// Applies constraints: navigates to the bare category+price page (the only
// two facets confirmed to serialize the same way everywhere — see
// urlSchema.ts), then arms the retry watcher, which resumeRetryIfPending
// picks up on the next page load to click-apply the rest.
export function applyWithRetry(constraints: Constraints): void {
  writeState({ constraints, attempt: 0 });
  navigateCurrentPageTo(buildBareUrlFromConstraints(constraints));
}

// Watches the just-applied (fully click-settled) state for zero results —
// via the search gateway's own reported count, or a DOM-based fallback for
// requests that never reach the gateway at all — and drops the next-least-
// confident filter and retries (a fresh bare-page navigation, since
// unclicking an already-checked box is less reliable than starting clean)
// up to MAX_ATTEMPTS, instead of silently leaving the user on a dead page.
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
    writeState({ constraints: next, attempt: state.attempt + 1 });
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
// progress, or does nothing if this load wasn't the result of applyWithRetry.
// The bare page just loaded carries only category+price; every other facet
// in state.constraints still needs to be click-applied here before it's
// meaningful to check whether the combination returned results.
export function resumeRetryIfPending(onGiveUp: (constraints: Constraints) => void): void {
  const state = readState();
  if (!state) return;

  const queue = buildClickQueue(state.constraints);

  if (queue.length === 0) {
    armZeroResultWatcher(state, onGiveUp);
    return;
  }

  waitForFilterSidebar().then(() => {
    applyClickQueue(queue).then(() => {
      armZeroResultWatcher(state, onGiveUp);
    });
  });
}
