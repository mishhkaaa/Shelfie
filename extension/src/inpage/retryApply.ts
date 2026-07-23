import type { Constraints } from "../api/types";
import { buildUrlFromConstraints } from "../adapter/urlSchema";
import { navigateCurrentPageTo } from "../adapter/navigate";

const STORAGE_KEY = "shelfie_retry_apply";
const MAX_ATTEMPTS = 5;
// How long to wait for a page to prove itself "no results" before assuming
// it's fine — covers the case where the failure never touches the search
// gateway at all (see DOM_CHECK_DELAY_MS below) and there's nothing else to
// wait on.
const DOM_CHECK_DELAY_MS = 1500;

// Drop order when a combination returns zero results: least-confident /
// most-likely-to-be-wrong fields first (free-text-derived facets like size
// and fabric are far more likely to use a value Myntra doesn't recognize
// than articleType or color, which come from a validated lexicon or the
// path itself) — never drops category.articleType, since without it there's
// no page to be on at all.
const DROP_ORDER: Array<(c: Constraints) => Constraints> = [
  (c) => ({ ...c, fabric: { include: [] } }),
  (c) => ({ ...c, sleeve: { include: [] } }),
  (c) => ({ ...c, neck: { include: [] } }),
  (c) => ({ ...c, size: { include: [] } }),
  (c) => ({ ...c, occasion: undefined }),
  (c) => ({ ...c, brand: { ...c.brand, include: [] } }),
  (c) => ({ ...c, color: { ...c.color, include: [] } }),
  // Last resort: drop every facet and keep only the bare category page —
  // some categories 404 on ANY unrecognized f= facet before the search
  // gateway is ever called (no JSON response to intercept at all), so the
  // only thing confirmed to work in that case is the plain /articleType URL.
  (c) => ({ ...c, brand: { include: [], exclude: [] }, color: { include: [], exclude: [] } }),
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

// Applies constraints and arms the retry watcher: if Myntra's own search
// gateway (observed via main-world-interceptor.ts) reports zero results, OR
// the page itself renders Myntra's empty-state/404 markup, drop the
// next-least-confident filter and try again, up to MAX_ATTEMPTS — instead
// of silently leaving the user on a dead page because one guessed facet
// key/value didn't match Myntra's real vocabulary.
export function applyWithRetry(constraints: Constraints): void {
  writeState({ constraints, attempt: 0 });
  navigateCurrentPageTo(buildUrlFromConstraints(constraints));
}

// Called once on every page load (from mount.ts) — resumes a retry in
// progress, or does nothing if this load wasn't the result of applyWithRetry.
export function resumeRetryIfPending(onGiveUp: (constraints: Constraints) => void): void {
  const state = readState();
  if (!state) return;

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
    navigateCurrentPageTo(buildUrlFromConstraints(next));
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
