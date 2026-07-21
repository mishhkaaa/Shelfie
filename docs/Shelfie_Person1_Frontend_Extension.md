# Shelfie — Person 1 Implementation Doc
### Frontend + Browser Extension — everything that runs in the browser

**This is your build doc.** It's meant to be complete enough that you can work for three days mostly without needing to ask the backend person anything, except at the scheduled checkpoints. Whenever this doc says "per the contract," it means [Shelfie_Shared_Contract.md](Shelfie_Shared_Contract.md) — that file's field names, endpoint shapes, and taxonomy values are binding; this doc tells you *how to build against them*, not what they are.

For the full product rationale (why any of this matters, how to pitch it, jury Q&A), read [Shelfie_Design_Doc_v2.md](Shelfie_Design_Doc_v2.md) once before you start — you don't need to re-read it daily, but you should understand the story you're building UI for. For plain-language explanations of drift/event-sourcing/fork if any of it feels abstract, [Shelfie_Architecture_Explained.md](Shelfie_Architecture_Explained.md) Parts 3, 4, 7, 10, 12 are written exactly for this.

Calendar: today is **2026-07-21**. Day 0 = tonight, Day 1 = Tue 2026-07-22, Day 2 = Wed 2026-07-23, Day 3 = Thu 2026-07-24 (**submit 1:00 PM IST**).

---

## Table of contents

1. [Your scope, precisely](#1-your-scope-precisely)
2. [Tech stack](#2-tech-stack)
3. [Repo folder structure](#3-repo-folder-structure)
4. [Day-by-day task list](#4-day-by-day-task-list)
5. [Day 0, task 1: verify Myntra's URL scheme (do this first, tonight)](#5-day-0-task-1-verify-myntras-url-scheme-do-this-first-tonight)
6. [The Adapter — full implementation spec](#6-the-adapter--full-implementation-spec)
7. [Zustand store — full spec](#7-zustand-store--full-spec)
8. [Every component, fully specified](#8-every-component-fully-specified)
9. [API client layer](#9-api-client-layer)
10. [manifest.json — full content](#10-manifestjson--full-content)
11. [Build & dev workflow](#11-build--dev-workflow)
12. [Error, loading, and empty states](#12-error-loading-and-empty-states)
13. [Styling conventions](#13-styling-conventions)
14. [Manual test checklist](#14-manual-test-checklist)
15. [Working before the backend is ready](#15-working-before-the-backend-is-ready)
16. [Demo-day checklist](#16-demo-day-checklist)
17. [Definition of done, per day](#17-definition-of-done-per-day)

---

## 1. Your scope, precisely

You own **everything that runs inside the browser**:
- The extension shell (manifest, content script, side panel host)
- The **Adapter** — translating Myntra's URL (and, as a documented fallback, its DOM) into Shelfie's clean `Constraints` object and back
- All UI: status bar, save flow, 3-way save modal, version timeline, persona switcher, Discover feed, deck cards, star/fork buttons, coverage/dry-run banners, fuzzy-intent text box, behavioural-suggestion toggle
- Client-side state (Zustand): tracking the "working set" (live filters) vs. the "active profile" (last saved state), and the resulting dirty/clean badge
- The API client that calls Person 2's backend, built exactly against [the contract](Shelfie_Shared_Contract.md#9-rest-api-contract)

You do **not** own: the database, the event sourcing engine, the drift/compiler/coverage algorithms, or deployment of the API. You *consume* all of those as HTTP endpoints.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Extension platform | **Chrome/Edge, Manifest V3**, content script + side panel | Runs on live Myntra — the whole integration-credibility argument (design doc §3) |
| UI | **React + Vite + Tailwind**, injected into the MV3 side panel | Fast to build, component-based, matches your existing React skills |
| Adapter | **Vanilla TypeScript**, isolated from React | All Myntra-coupling lives here and only here (design doc §8) |
| State | **Zustand** | Minimal boilerplate, clean dirty-state tracking |
| API calls | Plain `fetch`, thin wrapper module | No need for React Query/SWR at this scale — don't add a dependency you don't need |

---

## 3. Repo folder structure

```
extension/
├── manifest.json
├── vite.config.ts
├── package.json
├── tsconfig.json
├── .env.example                 # VITE_API_BASE_URL=http://localhost:8000
└── src/
    ├── content-script.ts         # injects the side panel root div into myntra.com pages
    ├── adapter/
    │   ├── urlSchema.ts           # Constraints <-> Myntra URL (§6)
    │   ├── domFallback.ts         # documented DOM-only special cases (§6.5)
    │   ├── taxonomy.ts            # copy of contract §5, single source within this codebase
    │   └── adapter.test.ts
    ├── store/
    │   └── useShelfieStore.ts     # Zustand store (§7)
    ├── api/
    │   ├── client.ts              # one function per endpoint (§9)
    │   └── types.ts               # TS mirrors of contract §6/§7
    └── panel/
        ├── App.tsx
        ├── StatusBar.tsx
        ├── ProfileList.tsx
        ├── SaveSheet.tsx
        ├── ThreeWaySaveModal.tsx
        ├── DryRunDiff.tsx
        ├── Timeline.tsx
        ├── PersonaSwitcher.tsx
        ├── DiscoverFeed.tsx
        ├── DeckCard.tsx
        ├── CoverageBanner.tsx
        ├── FuzzyInput.tsx
        ├── BehaviouralToggle.tsx
        └── Settings.tsx
```

---

## 4. Day-by-day task list

| Day | Your tasks | Must-have by end of day |
|---|---|---|
| **Day 0** (tonight) | Verify Myntra's URL scheme (§5) — do this before anything else. Extension skeleton: manifest, content script injects a placeholder panel. Set up mock fixtures per §15 so Day 1 isn't blocked on the backend. | Extension loads unpacked on myntra.com and shows *something* in a side panel. URL scheme documented in the Shared Contract §12. |
| **Day 1** | Adapter read+write path. `StatusBar` + `ProfileList` + `SaveSheet`, wired first to mocks, then to the real API at the EOD1 checkpoint. | On real Myntra: build a search → Save as Profile → reload → filters restored via URL. |
| **Day 2** | Dirty-state tracking, `ThreeWaySaveModal` (with drift reason from `/drift`), `Timeline` + Restore. | Modify active profile → correct 3-way save with reason shown → save v2 → rollback to v1 → shelf reverts live. |
| **Day 3** | `DiscoverFeed`, `DeckCard`, star/fork, `PersonaSwitcher`, `CoverageBanner`, `DryRunDiff`, `FuzzyInput`, `BehaviouralToggle`, full visual polish pass, package for demo. | Full UI polished, everything wired to real endpoints (or gracefully hidden if a backend piece isn't ready — see cut order in master doc §18). |

---

## 5. Day 0, task 1: verify Myntra's URL scheme (do this first, tonight)

This is the single highest-risk unknown in the whole project (design doc §3, risk #2; master doc §22). Everything downstream — the adapter, the whole save/reload spine — depends on it. Do this **before** writing extension boilerplate.

**Procedure:**
1. Open myntra.com in a normal browser tab.
2. Search `kurta`. Note the URL.
3. Apply one filter at a time — brand, price, fabric, sleeve, size, colour, sort — watching exactly how the URL bar changes after each. Take screenshots or just paste the URLs into a scratch file.
4. Identify the pattern: is it a query-string blob (`?f=brand:Libas`), path segments, or something else? Does *every* facet show up in the URL, or does one (commonly sort, or a "quick filter") stay DOM/POST-only?
5. Write the real scheme into [Shelfie_Shared_Contract.md §12.2](Shelfie_Shared_Contract.md#122-placeholder-mapping-replace-after-step-14-above), replacing the placeholder. List anything DOM-only in §12.3 of that doc.
6. If Myntra's actual filter panel differs from the taxonomy in contract §5 (e.g., different brand list, different fabric names), **do not silently invent new taxonomy values** — flag it, and either extend the shared taxonomy (with a heads-up to Person 2, since it affects their catalog seed) or map Myntra's real values down to the closest canonical value for the demo.

**If you get stuck / it's messier than expected:** don't burn the whole night on it. Fall back to reading a *subset* of facets from the URL (whatever's cleanly there) and treat everything else as DOM-only per §6.5 below — build the adapter against that; a partially-URL-driven adapter still delivers the demo.

---

## 6. The Adapter — full implementation spec

### 6.1 Responsibility

One module, two directions:
```
Myntra URL (string)  ──parse──▶  Constraints (typed object)
Constraints (typed object)  ──build──▶  Myntra URL (string), then navigate to it
```
Everything else in the extension only ever touches `Constraints` — never a raw Myntra URL string. This isolation is the entire point (design doc §8.2): if Myntra changes their site, you fix this one file.

### 6.2 Interface

```ts
// extension/src/adapter/urlSchema.ts

import type { Constraints } from "../api/types";

/** Parse the current Myntra URL into our typed constraint object. */
export function parseUrlToConstraints(url: string): Constraints;

/** Build a navigable Myntra URL from a constraint object. */
export function buildUrlFromConstraints(c: Constraints): string;

/** True if two constraint objects are field-for-field identical (used for dirty-state check). */
export function constraintsEqual(a: Constraints, b: Constraints): boolean;
```

### 6.3 Implementation shape (against the placeholder scheme — update once §5 is done)

```ts
export function parseUrlToConstraints(url: string): Constraints {
  const u = new URL(url);
  const path = u.pathname.split("/").filter(Boolean);       // ["kurta"]
  const params = u.searchParams;

  return {
    category: {
      articleType: path[0] ?? "",
      gender: params.get("gender") ?? undefined,
    },
    price: parseRange(params.get("price")),                  // "0-1500" -> {min:0,max:1500}
    brand: parseSet(params.get("brand")),                     // "Libas,Aurelia" -> {include:[...],exclude:[]}
    fabric: { include: csv(params.get("fabric")) },
    sleeve: params.has("sleeve") ? { include: csv(params.get("sleeve")) } : undefined,
    size: { include: csv(params.get("size")) },
    color: parseSet(params.get("color")),
    rating: params.has("rating") ? { min: Number(params.get("rating")) } : undefined,
    occasion: params.get("occasion") ?? undefined,
  };
}

export function buildUrlFromConstraints(c: Constraints): string {
  const base = `https://www.myntra.com/${c.category.articleType}`;
  const params = new URLSearchParams();
  if (c.category.gender) params.set("gender", c.category.gender);
  params.set("price", `${c.price.min}-${c.price.max}`);
  if (c.brand.include.length) params.set("brand", c.brand.include.join(","));
  if (c.fabric.include.length) params.set("fabric", c.fabric.include.join(","));
  if (c.sleeve?.include.length) params.set("sleeve", c.sleeve.include.join(","));
  if (c.size.include.length) params.set("size", c.size.include.join(","));
  if (c.color.include.length) params.set("color", c.color.include.join(","));
  if (c.rating?.min) params.set("rating", String(c.rating.min));
  if (c.occasion) params.set("occasion", c.occasion);
  return `${base}?${params.toString()}`;
}
```

`parseRange`, `parseSet`, `csv` are small private helpers — a few lines each, no need to over-engineer.

### 6.4 Read triggers

The adapter's read path must run:
- Once when the side panel first mounts (initial state)
- On every Myntra URL change while the panel is open — listen via the content script's `history.pushState`/`popstate` hooks (Myntra is almost certainly a SPA-ish app that updates the URL without a full reload) **and** a fallback `MutationObserver`/polling check in case some filter application doesn't go through `pushState` cleanly. A 300-500ms debounce on this listener avoids re-parsing on every keystroke of a still-typing search box.

### 6.5 DOM fallback (only for fields confirmed DOM-only in §5)

```ts
// extension/src/adapter/domFallback.ts
// Isolated on purpose — never mixed into urlSchema.ts's parsing logic.
export function readDomOnlyFields(): Partial<Constraints> {
  // e.g. if `sort` turns out not to be in the URL:
  // const sortEl = document.querySelector('[data-testid="sort-active"]');
  // return { sort: sortEl?.textContent ?? undefined };
  return {};
}
```
Keep this function's body as small as the Day-0 findings require. If nothing turns out to be DOM-only, leave it returning `{}` and delete the temptation to "future proof" it.

### 6.6 Write-path navigation

```ts
export function activateProfile(c: Constraints) {
  window.location.href = buildUrlFromConstraints(c);
}
```
If Myntra is an SPA where a full `location.href` reload is jarring or loses the side panel's mounted state, prefer `history.pushState` + dispatching whatever event triggers Myntra's own router — but confirm this actually re-renders their shelf (test it manually) before relying on it. **Fallback if write-navigation is flaky** (per master doc §18, Day 1 fallback): copy the constructed URL to the clipboard and show a "paste this into the address bar" hint — inelegant but keeps the demo alive.

### 6.7 Testing

Write `adapter.test.ts` covering: round-trip (`parse(build(c)) === c`) for at least one case per field type (a set field, a range field, an optional field left empty), and one hand-constructed real-looking Myntra URL parsed correctly. This is cheap insurance against a silent adapter bug that only shows up live during the demo.

---

## 7. Zustand store — full spec

```ts
// extension/src/store/useShelfieStore.ts
import { create } from "zustand";
import type { Constraints, ProfileVersion, DriftResponse } from "../api/types";

interface ShelfieState {
  currentUser: string;                    // "user_amma" — hardcoded per contract §11
  activePersona: string;                  // "persona_amma"
  personas: { id: string; label: string; emoji: string }[];

  activeProfile: ProfileVersion | null;
  liveConstraints: Constraints | null;
  isDirty: boolean;
  driftResult: DriftResponse | null;

  profiles: ProfileVersion[];
  decks: ProfileVersion[];
  behaviourSuggestOptIn: boolean;

  // actions
  setActivePersona: (id: string) => void;
  loadLiveConstraints: (c: Constraints) => void;      // called by the adapter's read trigger
  fetchProfiles: () => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;
  requestSave: () => Promise<void>;                    // fetches /drift, opens the 3-way modal
  confirmSave: (mode: "new_version" | "update" | "new_profile", name?: string) => Promise<void>;
  rollback: (profileId: string, toVersion: number) => Promise<void>;
  fetchDecks: (sort?: "stars" | "recent") => Promise<void>;
  forkDeck: (deckId: string) => Promise<void>;
  toggleStar: (deckId: string) => Promise<void>;
  setBehaviourOptIn: (v: boolean) => void;
}
```

**Dirty-state derivation** — recompute `isDirty` every time `liveConstraints` or `activeProfile` changes:
```ts
isDirty = activeProfile != null && !constraintsEqual(liveConstraints, activeProfile.constraints)
```
This single boolean drives the status bar's clean/dirty/no-profile visual state (§8.1).

**Why `requestSave` and `confirmSave` are separate:** the 3-way modal needs the drift reason *before* the user picks an option (it's pre-filled with the recommendation). `requestSave` calls `POST /drift`, stores the result, and opens the modal; `confirmSave` is what actually calls `POST /profiles/{id}/commit` once the user has chosen (or overridden) the recommended mode.

---

## 8. Every component, fully specified

Exact copy/mockups for these are in [Shelfie_Architecture_Explained.md Part 10](Shelfie_Architecture_Explained.md#part-10--feature-user-boards-for-teaching-your-teammates) (boards 1-10) — treat that wording as your UX spec. Below is the *build* spec: props, state, API calls, edge cases.

### 8.1 `StatusBar`
- **Props:** none (reads store)
- **States:** no profile active (`● Unsaved search — Save as Shopping Profile`), clean (`✓ {name} · v{version}`), dirty (`✎ {name} · v{version} — Unsaved changes`, amber)
- Clicking it when dirty opens `ThreeWaySaveModal` (via `requestSave()`); clicking when no profile active opens `SaveSheet`.

### 8.2 `ProfileList`
- Renders `profiles` filtered by `activePersona`.
- Each row: name, latest version, click → `activateProfile(id)`.
- Empty state: "No profiles yet for {persona}. Build a search and save it."

### 8.3 `SaveSheet`
- Text input for name, pre-filled with an AI-suggested name if `/compile`-style suggestion is available (Day 3 nice-to-have — if not wired, just leave the field blank with a placeholder).
- Read-only summary list of current `liveConstraints` (the "this profile saves" list — scrutability made visible, design doc §16.2). Build this by mapping each populated constraint field to one line of text.
- `Make public` checkbox → passed as `visibility` on create.
- Submit → `POST /profiles` (new profile) via the store.

### 8.4 `ThreeWaySaveModal`
- Opened by `requestSave()`, which has already populated `driftResult` in the store.
- Shows: what changed (diff the two constraint objects field by field — simple equality check per field, not a generic deep-diff library), the drift `reason` string verbatim from the API, three radio options with `driftResult.decision` pre-selected.
- Two visual variants per the design doc §16.3: normal (refinement wording) vs. vertical-change (bold "new shopping goal 🎯" framing) — branch on whether `driftResult.reason` indicates a category/vertical change (check the `fieldContributions.category` value, or simpler: check if `decision === "new_profile"` and category contribution dominates).
- `Preview changes` button → calls `POST /diff`, renders `DryRunDiff` inline.
- `Confirm` → `confirmSave(selectedMode, name?)`.

### 8.5 `DryRunDiff`
- Small, presentational: `+{added} added ({addedSampleBrands.join(", ")}) · −{removed} removed · = {total} total`.
- Called both from inside `ThreeWaySaveModal` (pre-save preview) and could be reused standalone if time permits — don't build a separate code path for that unless you actually need it Day 3.

### 8.6 `Timeline`
- Fetches `GET /profiles/{id}/timeline` when the active profile changes.
- Renders each version as a row: version number, a short constraint summary, "Restore" button (hidden on the current version).
- Restore → `rollback(profileId, version)` → on success, re-fetch `liveConstraints` via the adapter (since rollback changes the active version, the panel should trigger `activateProfile` logic to also navigate Myntra's URL — restoring the *live shelf*, not just the stored record, per design doc §16.5).

### 8.7 `PersonaSwitcher`
- Dropdown populated from `GET /personas` (or hardcoded 3-entry array if you want zero backend dependency for this — see contract §11, this is explicitly allowed to be static).
- On change: `setActivePersona`, then `fetchProfiles()` re-filters.

### 8.8 `DiscoverFeed` / `DeckCard`
- `DiscoverFeed` fetches `GET /decks?sort=stars` on mount and on sort-toggle.
- `DeckCard` per design doc §16.7 layout: name, owner, constraint summary, star count, fork count, `[Star]` `[Fork]` `[View]` buttons.
- Star → `toggleStar(deckId)`, optimistic UI update (increment locally, roll back on error).
- Fork → `forkDeck(deckId)` → on success, switch to "My Profiles" view and highlight the new forked profile so the "her deck untouched, mine's independent" moment is visually obvious in the demo.

### 8.9 `CoverageBanner`
- Conditionally rendered whenever `POST /coverage` (triggered on constraint change while building a search, debounced) returns a low count (pick a threshold, e.g. `count < 15`, tune during Day 3 testing against your seeded catalog's actual density).
- Shows top suggestion(s): `Only {count} products match. Try: [relax {field} → +{gain}]`. Clicking a suggestion applies that relaxation to `liveConstraints` directly (client-side edit, then optionally trigger Myntra navigation).

### 8.10 `FuzzyInput`
- A text box + submit. On submit → `POST /compile` with the raw text and current `liveConstraints` as base.
- Renders the response's `compiledTo` lines as an explanation (`"I set: cotton · ₹0–1500 · workwear · excluded neon, sequins"`), and merges `appliedConstraints` into `liveConstraints`.
- If `/compile` errors out or the LLM is down (contract §9 notes the lexicon fallback still returns `200` with a possibly-shorter `compiledTo` — the backend absorbs this, you shouldn't need special-case UI for "LLM down" beyond normal error handling).

### 8.11 `BehaviouralToggle`
- Simple checkbox in `Settings`, default **off**. Persist locally (extension storage or even just the Zustand store, no backend persistence strictly required for a hackathon).
- When on: after each completed search (adapter read fires, constraints look "settled" — e.g., no change for 3+ seconds), call `POST /behaviour/suggest`. If `suggest: true`, show a dismissible nudge with `reason`.
- When off: never call this endpoint at all — this is the actual privacy promise, not just a UI toggle (design doc §11), so make sure the code path is genuinely skipped, not just hidden.

---

## 9. API client layer

One function per endpoint in [the contract §9](Shelfie_Shared_Contract.md#9-rest-api-contract), all going through a shared `request()` helper that attaches the `X-User-Id` header and parses the `{error:{code,message}}` shape on failure.

```ts
// extension/src/api/client.ts
const BASE = import.meta.env.VITE_API_BASE_URL;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": useShelfieStore.getState().currentUser,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? "UNKNOWN", body?.error?.message ?? res.statusText);
  }
  return res.json();
}

export const createProfile = (body: CreateProfileRequest) =>
  request<ProfileVersion>("/profiles", { method: "POST", body: JSON.stringify(body) });

export const getProfiles = (persona?: string) =>
  request<ProfileVersion[]>(`/profiles${persona ? `?persona=${persona}` : ""}`);

export const getProfile = (id: string, version?: number) =>
  request<ProfileVersion>(`/profiles/${id}${version ? `?version=${version}` : ""}`);

export const commitProfile = (id: string, body: CommitRequest) =>
  request<ProfileVersion>(`/profiles/${id}/commit`, { method: "POST", body: JSON.stringify(body) });

export const rollbackProfile = (id: string, toVersion: number) =>
  request<ProfileVersion>(`/profiles/${id}/rollback`, { method: "POST", body: JSON.stringify({ toVersion }) });

export const getTimeline = (id: string) =>
  request<TimelineResponse>(`/profiles/${id}/timeline`);

export const computeDrift = (body: DriftRequest) =>
  request<DriftResponse>("/drift", { method: "POST", body: JSON.stringify(body) });

export const compileIntent = (body: CompileRequest) =>
  request<CompileResponse>("/compile", { method: "POST", body: JSON.stringify(body) });

export const getCoverage = (constraints: Constraints) =>
  request<CoverageResponse>("/coverage", { method: "POST", body: JSON.stringify({ constraints }) });

export const getDiff = (before: Constraints, after: Constraints) =>
  request<DiffResponse>("/diff", { method: "POST", body: JSON.stringify({ before, after }) });

export const publishProfile = (id: string, visibility: "public" | "private") =>
  request<ProfileVersion>(`/profiles/${id}/publish`, { method: "POST", body: JSON.stringify({ visibility }) });

export const getDecks = (params?: { sort?: string; occasion?: string; maxPrice?: number }) =>
  request<ProfileVersion[]>(`/decks?${new URLSearchParams(params as any).toString()}`);

export const starDeck = (id: string, action: "star" | "unstar") =>
  request<{ stars: number; starredByMe: boolean }>(`/decks/${id}/star`, { method: "POST", body: JSON.stringify({ action }) });

export const forkDeck = (id: string) =>
  request<ProfileVersion>(`/decks/${id}/fork`, { method: "POST", body: "{}" });

export const suggestBehaviour = (constraints: Constraints) =>
  request<{ suggest: boolean; reason?: string }>("/behaviour/suggest", { method: "POST", body: JSON.stringify({ constraints }) });

export const getPersonas = () => request<Persona[]>("/personas");
```

Every type referenced above (`CreateProfileRequest`, `DriftResponse`, etc.) is defined in `api/types.ts`, mirroring the contract exactly — copy the shapes from [contract §6/§7/§9](Shelfie_Shared_Contract.md) verbatim.

---

## 10. manifest.json — full content

```json
{
  "manifest_version": 3,
  "name": "Shelfie",
  "version": "0.1.0",
  "description": "Version-controlled shopping profiles for Myntra.",
  "permissions": ["storage", "sidePanel"],
  "host_permissions": ["https://www.myntra.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.myntra.com/*"],
      "js": ["content-script.js"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "panel.html"
  },
  "action": {
    "default_title": "Open Shelfie"
  },
  "icons": {
    "128": "icon128.png"
  }
}
```
`background.js` needs only enough logic to open the side panel on the extension icon click (`chrome.sidePanel.open(...)`) — a few lines, not a real background worker. Adjust `host_permissions` if Myntra serves from a different domain/subdomain than assumed here — confirm during Day-0 URL verification (§5).

---

## 11. Build & dev workflow

```bash
# from extension/
cp .env.example .env          # set VITE_API_BASE_URL
npm install
npm run build                 # -> extension/dist
```
Load in Chrome/Edge: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/dist`. After every `npm run build`, click the reload icon on the extension card to pick up changes — the MV3 side panel does not hot-reload on its own.

For fast iteration on panel components in isolation (without reloading the extension every time), `npm run dev` runs a normal Vite dev server you can open in a plain browser tab against mocked data — useful for layout/styling work, not for testing the adapter (which needs the real myntra.com DOM/URL).

---

## 12. Error, loading, and empty states

Every component that fetches must handle three states, minimum:
- **Loading:** a simple skeleton or spinner — don't over-design this, a one-line "Loading…" is fine for a hackathon.
- **Error:** render `error.message` from the `ApiError` (§9) in a small inline banner; never let a failed fetch silently show stale/empty data without explanation.
- **Empty:** every list (`ProfileList`, `Timeline`, `DiscoverFeed`) needs an explicit empty-state message, not just a blank area — these are exactly the states a judge might hit if they click around off-script.

---

## 13. Styling conventions

- Tailwind utility classes directly in components; no separate CSS files unless something genuinely needs a keyframe animation.
- Status color convention (keep consistent everywhere): **green** = clean/saved, **amber** = dirty/unsaved, **red** = error/destructive (only used for things like "this will overwrite," which you mostly avoid by design), **neutral gray** = default/no-profile.
- Keep the side panel narrow-width responsive (MV3 side panels are typically 300-400px) — test at that width specifically, not just full-browser-width.

---

## 14. Manual test checklist

Run this end-to-end at least once per day, and in full at least 3 times before Day 3 evening:

- [ ] Build a search on real Myntra → Save as Profile → name it → appears in `ProfileList`
- [ ] Reload the page, click the saved profile → Myntra shelf reconstructs correctly
- [ ] Change one filter (e.g. brand) while a profile is active → status bar goes amber
- [ ] Click Save while dirty → 3-way modal shows correct recommendation and reason
- [ ] Preview changes → diff numbers render
- [ ] Confirm "New Version" → timeline shows the new version
- [ ] Restore an older version from the timeline → Myntra shelf reverts live
- [ ] Change category to a different vertical (e.g. kurta → running shoes) → modal shows the "new shopping goal" variant
- [ ] Switch persona → profile list changes, no cross-contamination
- [ ] Open Discover → star a deck → fork it → forked copy appears in own profile list, editable, source untouched
- [ ] Toggle behavioural suggestion on → repeat a search 3x → nudge appears; toggle off → nudge never appears
- [ ] Type a fuzzy sentence → correct filters applied and explained

---

## 15. Working before the backend is ready

Don't wait. Per [contract §13](Shelfie_Shared_Contract.md#13-working-independently-mocking-the-other-side):
1. Seed `shared/fixtures/*.json` (coordinate with Person 2 on Day 0 so the shapes are agreed) with realistic sample responses for every endpoint you'll call.
2. Either point `VITE_API_BASE_URL` at a trivial mock server (a 20-line Express/json-server setup works fine), or intercept `fetch` with [MSW](https://mswjs.io/) inside the extension build.
3. Build and fully test every component against these mocks first. Swapping to the real API at each checkpoint (contract §14) should mean changing one env var, nothing else — if it means more than that, your API client didn't actually match the contract and that's the bug to fix.

---

## 16. Demo-day checklist

- [ ] Extension built fresh (`npm run build`) from the frozen Day-3 commit, reloaded in Chrome
- [ ] `VITE_API_BASE_URL` points at the deployed backend, not `localhost`
- [ ] Full manual test checklist (§14) passes against the deployed backend, not mocks
- [ ] Packaged as `.crx` or confirmed loadable unpacked on the judging machine
- [ ] Demo script (master doc §20) rehearsed at least twice against this exact build

---

## 17. Definition of done, per day

See [Shelfie_Shared_Contract.md §17](Shelfie_Shared_Contract.md#17-definition-of-done-per-day-both-sides) — your column is "Person 1 done means." Treat it as binding, not aspirational.
