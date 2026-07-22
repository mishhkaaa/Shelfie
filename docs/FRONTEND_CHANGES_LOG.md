# Frontend Changes Log

Every entry documents a change made to `extension/` while implementing the real backend + AI layer. Newest entries at the bottom, in the order changes were actually made. This file is for the teammate who owns the frontend and did not write these changes — be concrete enough that they don't need to read the diff to understand what happened and whether they need to do anything.

Format per entry:

```
## YYYY-MM-DD HH:MM — <short title>
**File(s):** path/to/file.tsx
**What changed:** one or two sentences, plain language
**Why:** which part of the master prompt this corresponds to
**Action needed from teammate:** none / rebuild / re-pull / install a new dependency (name it) / other
```

---

<!-- Entries start below this line. Do not remove this comment — it marks where the agent should begin appending. -->

## 2026-07-22 22:30 — Created the real API client
**File(s):** extension/src/api/client.ts (new), extension/src/api/types.ts
**What changed:** Added the previously-missing `src/api/client.ts` — a thin fetch wrapper that generates a random UUID via `crypto.randomUUID()` on first use, persists it in `chrome.storage.local` under `shelfie_account_id`, and sends it as `X-Account-Id` on every request. It exposes one function per backend endpoint (`listPersonas`, `createPersona`, `listProfiles`, `getProfile`, `createProfile`, `deleteProfile`, `drift`, `commit`, `rollback`, `suggestName`). Also added a `CommitResponse` interface to `api/types.ts` (`{ profileId, version, isNewProfile }`) and additive optional `createdAt`/`updatedAt`/`archived` fields to `ProfileVersion` — both purely additive, nothing existing was removed from these types.
**Why:** Master prompt Section 9.2 — the extension had no real backend integration at all.
**Action needed from teammate:** none. Note: there is no settings UI for the backend URL, so it's a hardcoded constant (`http://localhost:8000`) at the top of `client.ts` — change it there if the backend ever runs somewhere else.

## 2026-07-22 22:35 — Removed all seed/mock data, wired store to the real API
**File(s):** extension/src/store/useShelfieStore.ts
**What changed:** Rewrote the entire store. Removed the hardcoded `Amma`/`David` personas and `Bikini Tops`/`Hot Wheels Cars` profiles — `personas` and `profiles` now start empty and are populated only by a new `initialize()` action that fetches real data from the backend. Every action that used to mutate local mock state now calls the real backend first: `addPersona` → `POST /personas`, `saveProfile` → `POST /profiles`, `deleteProfile` → `DELETE /profiles/:id`, `requestSave` → `POST /profiles/:id/drift`, `confirmSave` → `POST /profiles/:id/commit`, `rollback` → `POST /profiles/:id/rollback` (replacing the old "just decrement the version number" fake rollback with a real server-side event replay). Also dropped the unused `currentUser` field (it was hardcoded to `"david"`) and removed the `zustand/middleware` `persist` wrapper entirely — the backend is now the single source of truth, so there's no local-storage mirror left that could show stale/mock data after a fresh install.
**Why:** Master prompt Sections 0.2 (no mocked data) and 9.3/9.4 (replace mock actions, remove seed data).
**Action needed from teammate:** none for behavior, but note the store's persisted `localStorage` key `shelfie-storage-v2` is no longer used — any previously-saved mock data sitting in a teammate's browser local storage under that key is now simply ignored (harmless, can be cleared via DevTools if desired).

## 2026-07-22 22:36 — Hydrate personas/profiles from the backend on panel open
**File(s):** extension/src/App.tsx
**What changed:** Added a `useEffect` that calls the store's new `initialize()` action once when the side panel mounts, so personas and the active persona's profiles load from the real backend every time the panel opens (not just on first install).
**Why:** Necessary follow-through for Section 9.4/definition-of-done ("creating a persona persists across a full extension reload") — without this, the store's empty initial state would never get populated.
**Action needed from teammate:** none.

## 2026-07-22 22:40 — Live-constraints panel now shows every detected field
**File(s):** extension/src/panel/SaveSheet.tsx
**What changed:** The "This profile will save:" list previously only rendered `brand.include` and `category.articleType`. It now renders every populated field: category (with gender if present), price range (only shown once a non-zero range is detected), brand include/exclude, fabric, sleeve, size, color include/exclude, min rating, and occasion.
**Why:** Master prompt Section 9.1 — this was the one explicitly-named display bug to fix. (No changes were made to `src/adapter/urlSchema.ts` — URL detection itself was confirmed working and out of scope.)
**Action needed from teammate:** none.

## 2026-07-22 22:42 — Added AI suggested-name chip to SaveSheet
**File(s):** extension/src/panel/SaveSheet.tsx
**What changed:** While the save sheet is open, live constraints are debounced (600ms) and sent to the new `POST /ai/suggest-name` endpoint. If a suggestion comes back, a small "✨ Suggested: <name>" chip appears above the name field — clicking it fills the name input. If the call fails, times out, or returns null, the chip simply never appears; nothing blocks typing or the Save button.
**Why:** Master prompt Sections 8.1 and 9.5.
**Action needed from teammate:** none.

## 2026-07-22 22:44 — manifest.json host_permissions for the backend
**File(s):** extension/manifest.json
**What changed:** Added `"http://localhost:8000/*"` to `host_permissions` alongside the existing Myntra entry.
**Why:** Master prompt Section 2 — without this, `fetch` calls from the side panel to the local backend would be blocked.
**Action needed from teammate:** rebuild/reload the unpacked extension in Chrome (manifest permission changes require a reload, not just a code rebuild).

## 2026-07-22 23:10 — Fixed incomplete filter capture found during real Chrome testing
**File(s):** extension/src/adapter/urlSchema.ts, extension/src/api/types.ts
**What changed:** After loading the unpacked extension and testing against live Myntra, it turned out only `Brand`/`Fabric`/`Sleeve`/`Size`/`Color` were ever read out of the URL — applying a Neck filter and an Occasion filter on Myntra had nowhere to go. Added a new `neck?: { include: string[] }` field to `Constraints` (mirrors `sleeve` exactly) and now parse both `Neck` and `Occasions` out of the `f=` param. Also fixed `buildUrlFromConstraints`, which only wrote `Brand`/`Fabric`/`Size`/`Color` back into a rebuilt URL — even `Sleeve` (which WAS being captured) was silently dropped when reopening a saved profile. It now writes back `Sleeve`, `Neck`, and `Occasions` too, so reopening a saved profile reconstructs the full filter set again instead of only brand/category/color.
**Why:** Real bug found by the user testing the loaded extension against live Myntra (multi-filter searches were losing most of their filters both when saving and when reapplying).
**Action needed from teammate:** none, but note `Constraints.neck` is a new optional field — any older locally-cached profile data just won't have it (defaults to absent, handled gracefully everywhere).

## 2026-07-22 23:12 — SaveSheet shows the new Neck field
**File(s):** extension/src/panel/SaveSheet.tsx
**What changed:** Added a "Neck" row to the "This profile will save:" list, alongside the other fields added earlier today.
**Why:** Follow-through for the `neck` field addition above.
**Action needed from teammate:** none.

## 2026-07-22 23:15 — Version labeling: three-way save modal + real Timeline history
**File(s):** extension/src/panel/ThreeWaySaveModal.tsx, extension/src/panel/Timeline.tsx, extension/src/store/useShelfieStore.ts, extension/src/api/types.ts
**What changed:** User feedback after testing: version history only ever showed "v1"/"v2" with no way to name a version, and the Timeline only ever showed the current version and exactly one previous version (an artifact of the old mock's `version - 1` math), not real history. Added an optional "Label this version" text input to `ThreeWaySaveModal` — reuses the existing `confirmSave(mode, name?)` signature unchanged, just now populates `name` for `new_version`/`update` too (previously only used for the new-profile-name case). Rewrote `Timeline.tsx` to render the backend's new `activeProfile.history` array (every version ever committed, with its label if any) instead of just current/current-1, with a working "Revert to vN" button on every non-current entry. Added `ProfileHistoryEntry` type and `versionLabel`/`history` fields to `ProfileVersion` (both additive/optional). Also changed `confirmSave` in the store to re-fetch the full profile from the backend after a successful commit instead of hand-constructing the updated object locally, since the backend response now carries `versionLabel`/`history` that couldn't otherwise be reconstructed client-side.
**Why:** Direct user feedback after testing the real save/version flow in the browser.
**Action needed from teammate:** none.

## 2026-07-22 23:40 — Fixed wrong facet key + generic catch-all for unmodeled filters
**File(s):** extension/src/adapter/urlSchema.ts, extension/src/api/types.ts, extension/src/panel/SaveSheet.tsx
**What changed:** Real bug: Myntra's actual fabric facet key is `"Fabric Types"`, not `"Fabric"` — every fabric filter was silently dropped even though the field existed, because the parser's key-match never fired. Fixed that, and — since this is now the third individual facet name found missing this way (`Neck`, then this, and `Length`/others would keep coming) — added a generic `Constraints.other: Record<string, string[]>` catch-all. The parser now extracts every `key:value` pair from Myntra's `f=` param, keeps pulling the ones we explicitly model into their typed fields, and preserves everything else (Length, Fashion Trends, Pattern, etc.) in `other` so a multi-filter search never silently loses data again — just without a drift weight, since we can't score facets by name we don't otherwise understand. `buildUrlFromConstraints` and `SaveSheet`'s constraint display both handle `other` too, so it round-trips and displays like any other field.
**Why:** Real bug found by the user testing multi-filter searches against live Myntra (screenshot showed `Fabric Types:Cotton::Length:Mini` in the URL, neither of which showed up in the "This profile will save" panel).
**Action needed from teammate:** none.

## 2026-07-22 23:45 — Root-caused and fixed "Save Profile does nothing"
**File(s):** extension/src/store/useShelfieStore.ts, extension/src/panel/SaveSheet.tsx
**What changed:** User reported clicking Save Profile produced zero network requests and nothing appeared. Root cause: `saveProfile`'s guard clause silently `return`ed when there was no active persona yet (the screenshot showed the "add persona" input still open, name typed but Enter never pressed) — the fetch was never even attempted. Added `console.error` diagnostics to this and the other store guard clauses (`requestSave`, `confirmSave`) so a silent no-op is now visible in devtools, and `SaveSheet` now shows "Create or select a persona... before saving a profile" instead of a save form that looks functional but silently does nothing when no persona is active.
**Why:** Direct user bug report — this was a frontend guard-clause issue, not a backend problem.
**Action needed from teammate:** none, but worth knowing: a persona must be created (via the + button) and confirmed with Enter before Save Profile will do anything — there's now a visible message instead of silence when that's not yet true.

## 2026-07-22 23:55 — Gender now parsed properly; "Categories" facet explained + surfaced
**File(s):** extension/src/adapter/urlSchema.ts
**What changed:** User asked why saving a profile on `myntra.com/nike-shoes` with the "Sports Shoes" category checkbox and "Men" gender selected showed `Category: nike-shoes` instead of `Sports Shoes`, and no gender at all. Two different things were going on, handled two different ways (see explanation given directly to the user for the reasoning): `Gender:men,men women` was previously not parsed into anything at all — it's now parsed into `category.gender` (first value, "men"), which is a real weighted drift field and displays as part of the Category line, e.g. "nike-shoes (men)". The `Categories:Sports Shoes` facet is a genuinely different, separate concept from `category.articleType` and was NOT merged into it — `articleType` is required to double as the actual Myntra URL path segment when reopening a saved profile (`https://www.myntra.com/${articleType}`), and "Sports Shoes" is not a valid path segment (the real one is "nike-shoes"), so swapping it in would silently break "click a saved profile to reopen it". Instead, "Categories" is no longer silently dropped — it now flows into the generic `other` bucket (added in the previous fix) and displays as its own "Categories: Sports Shoes" row alongside "Category: nike-shoes", so both signals are visible without risking a broken URL.
**Why:** Direct user question about a category-naming discrepancy after real-browser testing.
**Action needed from teammate:** none.
