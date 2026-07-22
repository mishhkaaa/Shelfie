# Shelfie Extension Implementation
### What has been built inside `extension/` so far

**Scope of this document:** this is a practical inventory of the browser extension that currently exists in the repo. It focuses on what is actually implemented in `extension/`, how the pieces connect, and what behavior is still mocked or incomplete.

**Current date:** 2026-07-22

---

## 1. What the extension is right now

The extension is a Chrome Manifest V3 side-panel app for Myntra. It watches the current Myntra URL, translates that URL into structured shopping constraints, keeps those constraints in local client state, and lets the user save or re-open shopping profiles from the side panel.

The implementation currently includes:

- A background service worker that opens the side panel when the extension icon is clicked.
- A content script that watches SPA navigation on Myntra and reports URL changes back to the extension.
- A React side-panel UI built with Vite, TypeScript, Tailwind CSS, and Zustand.
- A simple adapter that parses Myntra URLs into a typed constraint object and rebuilds a Myntra URL from that object.
- Mocked persona, profile, drift, and rollback flows so the UI feels functional even without a backend.

What is not present yet:

- No real backend API integration.
- No persistent server-side profile store.
- No real drift engine or AI endpoint.
- No public deck/discovery/share/fork network behavior.

---

## 2. Extension architecture

The extension is split into three browser-side layers:

1. **Background service worker**
   - Responds to the extension icon click.
   - Opens the Chrome side panel for the current window.

2. **Content script on Myntra**
   - Runs on `https://www.myntra.com/*`.
   - Detects URL changes caused by browser navigation or client-side routing.
   - Sends those URL changes to the side panel.
   - Accepts navigation messages from the side panel and redirects the page.

3. **Side panel UI**
   - Renders the profile list, save sheet, version timeline, and drift modal.
   - Stores the active persona, active profile, live constraints, and mock drift state.
   - Converts saved profile constraints back into a Myntra URL and navigates the active tab.

This is a browser-first implementation. Everything in the current `extension/` folder runs locally in the extension process or on the visited Myntra page.

---

## 3. File inventory

### Root extension files

- `extension/manifest.json`
  - Manifest V3 configuration.
  - Requests `storage`, `sidePanel`, and `tabs` permissions.
  - Declares the Myntra content script.
  - Sets the side panel default entry point to `index.html`.

- `extension/package.json`
  - Defines the Vite build and dev workflow.
  - Adds `copy manifest.json dist\manifest.json` to the build pipeline so the browser receives the manifest in `dist`.

- `extension/vite.config.ts`
  - Vite build configuration for the extension app.

- `extension/index.html`
  - The side-panel app shell that mounts the React UI.

- `extension/public/`
  - Static public assets for the extension build.

### Source files

- `extension/src/background.ts`
  - Opens the side panel when the extension icon is clicked.

- `extension/src/content-script.ts`
  - Injected into Myntra pages.
  - Watches `popstate`, `history.pushState`, and `history.replaceState`.
  - Sends `MYNTRA_URL_CHANGED` messages to the extension.
  - Listens for `NAVIGATE_TO` messages and redirects the page.

- `extension/src/main.tsx`
  - React root bootstrap.

- `extension/src/App.tsx`
  - Main side-panel screen.
  - Wires URL listening, persona selection, profile creation, and the main panel sections.

- `extension/src/index.css`
  - Tailwind import and custom theme colors for the Myntra brand styling.

- `extension/src/adapter/urlSchema.ts`
  - Parses Myntra URLs into `Constraints`.
  - Rebuilds Myntra URLs from `Constraints`.
  - Provides simple equality checking for dirty-state detection.

- `extension/src/api/types.ts`
  - TypeScript interfaces for constraints, profile versions, and drift responses.

- `extension/src/store/useShelfieStore.ts`
  - Zustand store for all extension state.
  - Persists state with `zustand/middleware`.
  - Contains mock personas, mock profiles, rollback, save, and drift behavior.

- `extension/src/panel/StatusBar.tsx`
  - Shows whether the current search is unsaved, saved, or dirty.
  - Triggers the mock drift/save flow when the active profile has unsaved changes.

- `extension/src/panel/ProfileList.tsx`
  - Lists saved profiles for the selected persona.
  - Activates a profile and navigates the active Myntra tab to the profile’s URL.
  - Supports deleting a profile from the list.

- `extension/src/panel/SaveSheet.tsx`
  - Displays a save form when there is no active clean profile.
  - Saves the current live constraints as a named profile.

- `extension/src/panel/Timeline.tsx`
  - Shows the current profile version and a minimal previous-version view.
  - Supports rollback to the previous version.

- `extension/src/panel/ThreeWaySaveModal.tsx`
  - Mock “AI drift analysis” modal.
  - Offers three save choices: new version, update current, or save as new profile.

- `extension/src/assets/`
  - Static assets used by the UI.

---

## 4. Runtime flow

### 4.1 Opening the side panel

1. The user clicks the extension icon.
2. `background.ts` opens the Chrome side panel for the active window.
3. The React app renders inside `index.html` through `main.tsx` and `App.tsx`.

### 4.2 Capturing Myntra URL changes

1. The content script loads on Myntra pages.
2. It immediately reports the current URL.
3. It watches browser navigation and SPA history changes.
4. Every detected URL is sent to the side panel as `MYNTRA_URL_CHANGED`.
5. The side panel parses the URL into structured constraints.

### 4.3 Keeping live constraints in sync

1. `App.tsx` listens for runtime messages and tab updates.
2. When a Myntra URL is detected, it calls `parseUrlToConstraints`.
3. The store updates `liveConstraints`.
4. The dirty flag is computed by comparing live constraints with the active profile’s constraints.

### 4.4 Saving and reopening profiles

1. The user can enter a profile name and save the current search.
2. The save action writes a new mock `ProfileVersion` into local Zustand state.
3. The profile list shows stored profiles for the current persona.
4. Clicking a saved profile rebuilds the corresponding Myntra URL.
5. The extension sends a `NAVIGATE_TO` message to the active tab, with a fallback to `chrome.tabs.update` if the content script is not available.

### 4.5 Mock drift and rollback

1. If a profile exists and the live constraints differ, the status bar marks the profile as dirty.
2. Clicking the dirty status creates a hard-coded mock drift result.
3. The drift modal offers three save modes.
4. The timeline allows rollback by decrementing the version number in state.

---

## 5. Data model used by the extension

The extension shares a small typed shape through `src/api/types.ts`.

### `Constraints`

The current constraint object includes:

- `category.articleType`
- `category.gender` as an optional field
- `price.min` and `price.max`
- `brand.include` and `brand.exclude`
- `fabric.include`
- `sleeve.include` as optional in the type, but used in the adapter
- `size.include`
- `color.include` and `color.exclude`
- optional `rating` and `occasion`

### `ProfileVersion`

Each stored profile currently has:

- `id`
- `name`
- `version`
- `personaId`
- `constraints`

### `DriftResponse`

The modal uses a simplified drift result shape:

- `decision`: `new_version`, `update`, or `new_profile`
- `reason`
- `fieldContributions`

The current implementation stores the drift result as a mock object rather than calling an endpoint.

---

## 6. URL adapter behavior

`src/adapter/urlSchema.ts` is the core integration point between Myntra and Shelfie.

### Parsing

The parser:

- Extracts the first pathname segment as `articleType`.
- Reads the Myntra `f` query parameter.
- Splits the decoded filter string on `::`.
- Pulls list-style filter values for keys such as `Brand`, `Fabric`, `Sleeve`, `Size`, and `Color`.

### Building URLs

The builder:

- Creates a Myntra base URL from `category.articleType`.
- Serializes include filters into `f=...` using Myntra-style `Key:Value1,Value2` syntax.
- Joins separate filters with `::`.

### Equality

The adapter uses `JSON.stringify` equality to decide whether live constraints are dirty relative to the active profile.

This is intentionally simple and works for the current MVP shape.

---

## 7. State management

The store in `src/store/useShelfieStore.ts` is the source of truth for the current UI session.

### Persistent state

The store is wrapped in Zustand `persist`, so the state is written to local storage under the key `shelfie-storage-v2`.

### Current state fields

- `currentUser`
- `activePersona`
- `personas`
- `activeProfile`
- `liveConstraints`
- `isDirty`
- `driftResult`
- `profiles`

### Actions already implemented

- `setActivePersona`
- `addPersona`
- `loadLiveConstraints`
- `activateProfile`
- `saveProfile`
- `deleteProfile`
- `requestSave`
- `clearDrift`
- `confirmSave`
- `rollback`

### Important implementation detail

The store currently ships with seeded mock data:

- Persona: `Amma`
- Persona: `David`
- Profile: `Bikini Tops`
- Profile: `Hot Wheels Cars`

This gives the UI immediate content without a backend.

---

## 8. UI surface that exists today

### `App.tsx`

The main panel contains:

- Branding header and logo area.
- Persona selector with an inline add-persona control.
- `StatusBar`
- `ProfileList`
- `SaveSheet`
- `Timeline`
- `ThreeWaySaveModal`

It also handles:

- Current active tab URL inspection when the panel opens.
- Live message handling from the content script.
- Tab update handling for reloads and navigation.

### `StatusBar`

Shows one of three states:

- Unsaved search.
- Saved profile with unsaved changes.
- Saved clean profile.

### `ProfileList`

Shows only profiles for the selected persona and lets the user:

- Open a profile.
- Navigate the active Myntra tab to the stored filter URL.
- Delete the profile.

### `SaveSheet`

Appears when there is no active clean profile and lets the user save the current live search as a new profile.

### `Timeline`

Shows the active version and, when version > 1, a previous version with rollback.

### `ThreeWaySaveModal`

Appears when the mock drift analysis is requested and presents the three save decisions.

---

## 9. Styling and presentation

The extension’s styling is currently a lightweight Tailwind-based implementation with a small custom brand palette:

- Brand color: `#ff3f6c`
- Hover color: `#e0325d`
- Dark color: `#282c3f`

The UI uses:

- Neutral gray surfaces.
- White cards with simple borders and shadows.
- Small, dense side-panel controls.
- A browser-extension feel rather than a standalone app shell.

The current font stack in `index.css` is system-based rather than a custom display family.

---

## 10. Build and run

The current extension package scripts are:

- `npm run dev` — Vite dev server.
- `npm run build` — TypeScript build, Vite production build, and manifest copy into `dist`.
- `npm run lint` — Oxlint.
- `npm run preview` — Vite preview.

The manifest is copied into the output bundle during build so the browser can load the extension from the generated `dist` directory.

---

## 11. What is still mocked or incomplete

The following parts exist as scaffolding or local-only behavior rather than production logic:

- Drift analysis is a fixed mock object in the store.
- Save decisions do not call a backend.
- Rollback only changes local version state.
- Profiles are local-only and seed-driven, not fetched from an API.
- Persona creation only updates the in-memory/persisted client state.
- The adapter only covers a limited subset of Myntra URL filters.
- No real API client exists yet in `src/api/client.ts` because that file is not present.

These gaps are intentional for the current stage of the build, but they are the main places that would need follow-up work for a production-integrated extension.

---

## 12. Summary

The extension currently implements the browser-facing spine of Shelfie:

- Detect the live Myntra URL.
- Translate URL filters into typed shopping constraints.
- Persist a local set of personas and profiles.
- Rebuild and reopen saved searches.
- Surface a draft version-history and drift UI.

In short, the repo already has a working extension shell with the main user flows modeled in the browser. The missing part is the real backend and AI/service integration that would turn the mock save and drift flows into the full product described in the design docs.