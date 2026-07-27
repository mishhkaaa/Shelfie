// Applies facets Myntra doesn't serialize consistently (fabric, sleeve,
// neck, size, color, occasion, brand, gender, and anything caught in
// Constraints.other) by finding and clicking the real, already-rendered
// filter checkboxes on the current category page — instead of guessing the
// `f=` key/value Myntra expects (see urlSchema.ts's buildBareUrlFromConstraints
// doc comment for why that guessing was the root cause of filters
// zero-matching or silently vanishing). A checkbox we click is by definition
// a real, valid filter for this exact category page, so this can never send
// Myntra a facet it doesn't recognize.
//
// NOTE: Myntra's DOM structure was never directly inspectable from this
// environment (no live browser access) — the "Label (count)" checkbox
// rendering this matches against is inferred from screenshots the user
// provided, not confirmed against real markup/class names. Matching is
// deliberately generic (by visible text, not CSS classes) to be as
// resilient as possible to exact markup this couldn't be tested against,
// but it may need one round of live-tested adjustment.
import type { Constraints } from "../api/types";

export interface ClickTarget {
  field: string;
  value: string;
}

// Order mirrors retryApply.ts's DROP_ORDER priority (least-confident first)
// — `other` goes first since those keys/values are free-form and least
// vetted of all.
export function buildClickQueue(c: Constraints): ClickTarget[] {
  const queue: ClickTarget[] = [];

  if (c.other) {
    for (const values of Object.values(c.other)) {
      for (const v of values ?? []) queue.push({ field: "other", value: v });
    }
  }
  for (const v of c.fabric?.include ?? []) queue.push({ field: "fabric", value: v });
  for (const v of c.sleeve?.include ?? []) queue.push({ field: "sleeve", value: v });
  for (const v of c.neck?.include ?? []) queue.push({ field: "neck", value: v });
  for (const v of c.size?.include ?? []) queue.push({ field: "size", value: v });
  if (c.occasion) queue.push({ field: "occasion", value: c.occasion });
  for (const v of c.brand?.include ?? []) queue.push({ field: "brand", value: v });
  for (const v of c.color?.include ?? []) queue.push({ field: "color", value: v });
  if (c.category.gender) queue.push({ field: "gender", value: c.category.gender });

  return queue;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Matches Myntra's observed filter-checkbox rendering: visible label text
// immediately followed by a parenthesized count, e.g. "Cotton (233)",
// "Black (5669)". Restricted to leaf nodes (no element children) so a whole
// filter *section* (which also contains this text somewhere in its subtree)
// is never matched instead of the individual option.
const LABEL_WITH_COUNT = /^(.+?)\s*\([\d,]+\)\s*$/;

function findLeafFilterLabels(): { el: HTMLElement; label: string }[] {
  const all = document.querySelectorAll<HTMLElement>("li, label, span, div, a");
  const results: { el: HTMLElement; label: string }[] = [];
  for (const el of all) {
    if (el.children.length > 0) continue; // leaf only
    const text = el.textContent?.trim();
    if (!text) continue;
    const match = text.match(LABEL_WITH_COUNT);
    if (match) results.push({ el, label: match[1].trim() });
  }
  return results;
}

// Climbs to the nearest actually-clickable ancestor: a real checkbox input
// if one exists nearby (most robust — Myntra's own click handler is on it),
// otherwise the closest li/label/a, otherwise the leaf text node itself
// (custom checkbox components often bind their click handler to the whole
// row rather than a real <input>).
function nearestClickable(leaf: HTMLElement): HTMLElement {
  const container = leaf.closest("li, label, a") as HTMLElement | null;
  const checkbox = container?.querySelector('input[type="checkbox"]') as HTMLElement | null;
  return checkbox ?? container ?? leaf;
}

function dispatchClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}

// Finds the filter checkbox for `value`: exact (normalized) match first,
// falling back to substring containment only if no exact match exists —
// minimizes the chance of clicking the wrong option (e.g. "S" matching
// inside an unrelated longer label).
export function findFilterElement(value: string): HTMLElement | null {
  const target = normalize(value);
  if (!target) return null;

  const labels = findLeafFilterLabels();

  const exact = labels.find((l) => normalize(l.label) === target);
  if (exact) return nearestClickable(exact.el);

  const partial = labels.find((l) => {
    const n = normalize(l.label);
    return n.includes(target) || target.includes(n);
  });
  return partial ? nearestClickable(partial.el) : null;
}

// The filter sidebar renders asynchronously after navigation — poll for any
// recognizable filter-checkbox label rather than a fixed selector (whose
// exact class names aren't known here).
export function waitForFilterSidebar(timeoutMs = 8000, pollMs = 200): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (findLeafFilterLabels().length > 0) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, pollMs);
    };
    tick();
  });
}

// Waits for Myntra's own re-fetch to settle after a click (signaled by
// main-world-interceptor.ts's gateway-result event) before searching for the
// next queued filter, since the sidebar can re-render/remount between
// clicks — falls back to a fixed delay if no such event arrives (e.g. a
// filter interaction that doesn't hit the gateway at all).
function waitForSettle(maxMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("shelfie:gateway-result", onResult);
      resolve();
    };
    const onResult = () => finish();
    window.addEventListener("shelfie:gateway-result", onResult);
    setTimeout(finish, maxMs);
  });
}

export interface ClickQueueResult {
  applied: ClickTarget[];
  skipped: ClickTarget[];
}

// Processes the queue strictly sequentially (never in parallel) — clicking
// one filter can cause Myntra to re-render the whole sidebar, which would
// detach/invalidate DOM references collected ahead of time.
export async function applyClickQueue(queue: ClickTarget[]): Promise<ClickQueueResult> {
  const applied: ClickTarget[] = [];
  const skipped: ClickTarget[] = [];

  for (const target of queue) {
    const el = findFilterElement(target.value);
    if (!el) {
      console.warn(`Shelfie: no filter checkbox found for ${target.field}="${target.value}" — skipping`);
      skipped.push(target);
      continue;
    }
    dispatchClick(el);
    applied.push(target);
    await waitForSettle();
  }

  return { applied, skipped };
}
