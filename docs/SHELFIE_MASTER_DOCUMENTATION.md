# Shelfie — Complete Technical Documentation

**A version-controlled, collaborative, AI-assisted shopping-profile system for Myntra, delivered as a Chrome extension + FastAPI backend.**

This document is the single, exhaustive reference for the entire system as it exists right now: the problem it solves, the full architecture, every file and what it does, every feature end-to-end (including the exact algorithms/formulas), the complete API surface, and the real bugs found and fixed while building it against the live Myntra site. It is meant to be readable on its own, without needing to also read `BACKEND_BUILD_LOG.md` / `FRONTEND_CHANGES_LOG.md` (those remain the chronological build diaries; this document is the synthesized, structural reference).

---

## Table of Contents

1. [Problem Statement & Product Vision](#1-problem-statement--product-vision)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Repository & Folder Structure](#3-repository--folder-structure)
4. [Data Model](#4-data-model)
5. [Identity Model — No Login, Account-Scoped by Header](#5-identity-model--no-login-account-scoped-by-header)
6. [Core Domain Concepts](#6-core-domain-concepts)
7. [The Drift Engine](#7-the-drift-engine)
8. [AI Integration Layer (Groq)](#8-ai-integration-layer-groq)
9. [Feature Deep Dives](#9-feature-deep-dives)
10. [Frontend Architecture — Five Separate Bundles](#10-frontend-architecture--five-separate-bundles)
11. [Complete API Reference](#11-complete-api-reference)
12. [The Myntra URL Adapter — Parsing & Building](#12-the-myntra-url-adapter--parsing--building)
13. [Security, CORS & Environment Configuration](#13-security-cors--environment-configuration)
14. [Real Bugs Found During Development](#14-real-bugs-found-during-development)
15. [Known Limitations & Explicitly Out-of-Scope Items](#15-known-limitations--explicitly-out-of-scope-items)
16. [Setup & Run Instructions](#16-setup--run-instructions)

---

## 1. Problem Statement & Product Vision

Online shopping filters are ephemeral. A parent shopping for two children on the same Myntra account has to rebuild the same filter combination (brand, size, color, price range) every single visit, for every persona, with no memory of what worked last time and no way to tell whether "black cotton kurtas under ₹1500" from last month is the same search as the one they're building right now or a meaningfully different one.

**Shelfie turns a Myntra filter search into a versioned, shareable, collaborative artifact** — a "Shopping Profile" — by:

- Watching the live Myntra URL and translating it into a structured, typed constraint object (category, price, brand, fabric, color, size, sleeve, neck, occasion, and a catch-all for anything not explicitly modeled).
- Letting a user save that structured search under a named persona (e.g. "Amma", "Kid"), and reopen it later to instantly re-navigate Myntra to the same filtered view.
- Detecting, deterministically and explainably (not as an AI black box), whether a change to the live filters is a **minor tweak** (update in place), a **meaningful evolution** (save as a new version, keep history), or **a different search entirely** (save as a new profile) — and letting the user confirm or override that recommendation.
- Preserving full version history via event sourcing, so rollback is a real replay of past events, not a decremented counter.
- Letting profiles be published, discovered, starred, and forked between different users/personas — turning individual shopping intents into a small social graph.
- Suggesting profiles proactively from repeated browsing behavior (opt-in, privacy-respecting).
- Advising on filter combinations that are too narrow to return results, and previewing what a filter change would actually add/remove before committing to it.
- Accepting natural language ("pure cotton kurtas under 1500 for school") and turning it into validated, applied filters — never guessing past what a small hand-maintained vocabulary can confidently map.
- Making a saved profile shareable outside the extension entirely, over WhatsApp, with an AI-written one-line description and a working link.

Every one of these is built as **real, tested, working software** — there is no mocked data, no hardcoded demo state, and no AI call without a deterministic, always-available fallback.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Chrome Browser                              │
│                                                                           │
│  ┌───────────────────┐   ┌──────────────────────────────────────────┐   │
│  │   Side Panel       │   │              myntra.com tab               │   │
│  │  (real ES module,  │   │                                            │   │
│  │   index.html)      │   │  ┌──────────────────────────────────────┐  │   │
│  │                     │   │  │ Isolated-world content script       │  │   │
│  │  useShelfieStore    │   │  │ (content-script.js)                 │  │   │
│  │  (Zustand)          │   │  │  - watches pushState/popstate        │  │   │
│  │                     │   │  │  - relays URL changes to the panel   │  │   │
│  │  StatusBar          │   │  │  - executes NAVIGATE_TO commands     │  │   │
│  │  ProfileList        │   │  └──────────────────────────────────────┘  │   │
│  │  SaveSheet          │   │                                            │   │
│  │  Timeline           │   │  ┌──────────────────────────────────────┐  │   │
│  │  ThreeWaySaveModal  │   │  │ Isolated-world in-page panel          │  │   │
│  │  BehaviourPanel     │   │  │ (inpage-panel.js, Shadow DOM)         │  │   │
│  │  GlobalExclusions   │   │  │  - floating button + popover           │  │   │
│  │  Panel              │   │  │  - useInpageStore (separate Zustand)  │  │   │
│  │                     │   │  │  - Discover feed, NL search, Fork      │  │   │
│  └──────────┬──────────┘   │  └──────────────────────────────────────┘  │   │
│             │              │                                            │   │
│             │              │  ┌──────────────────────────────────────┐  │   │
│  ┌──────────┴──────────┐   │  │ MAIN-world interceptor                │  │   │
│  │ background.js       │   │  │ (main-world-interceptor.js)           │  │   │
│  │ (service worker,     │   │  │  - patches page's own fetch/XHR       │  │   │
│  │  opens side panel)   │   │  │  - reports Myntra's real search-      │  │   │
│  └──────────────────────┘   │  │    gateway result counts back         │  │   │
│                              │  └──────────────────────────────────────┘  │   │
│                              └──────────────────────────────────────────┘   │
└──────────────────────────────────────┬────────────────────────────────────┘
                                        │ HTTPS (X-Account-Id header)
                                        ▼
                        ┌───────────────────────────────────┐
                        │      FastAPI backend :8000         │
                        │  personas / profiles / drift /     │
                        │  discover / behaviour / catalog /   │
                        │  ai / share routers                 │
                        └──────────────┬──────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌───────────────┐  ┌────────────────┐  ┌────────────────┐
            │  PostgreSQL   │  │  Groq (4 keys,  │  │  Twilio (WhatsApp│
            │  :5433        │  │  round-robin)   │  │  Business API)   │
            │  (event store)│  │                 │  │                  │
            └───────────────┘  └────────────────┘  └────────────────┘
```

**Three independent browser-side JavaScript execution contexts run simultaneously** on a Myntra tab, plus a fourth for the side panel — see [Section 10](#10-frontend-architecture--five-separate-bundles) for exactly why each exists and cannot be merged with another.

**The backend is a single FastAPI process** with no authentication system (see [Section 5](#5-identity-model--no-login-account-scoped-by-header)), backed by Postgres for all persistent state, Groq for every AI touchpoint (with deterministic fallbacks everywhere), and Twilio for outbound WhatsApp sharing.

---

## 3. Repository & Folder Structure

```
Shelfie/
├── docs/                                   Living documentation
│   ├── BACKEND_BUILD_LOG.md                Chronological backend build diary
│   ├── FRONTEND_CHANGES_LOG.md             Chronological frontend build diary
│   ├── SHELFIE_MASTER_DOCUMENTATION.md     This file
│   └── (design docs, architecture explainers from earlier planning)
│
├── backend/
│   ├── .env                                Real secrets (gitignored)
│   ├── .env.example                        Blank placeholders for every env var
│   ├── docker-compose.yml                  Postgres 16-alpine, host port 5433
│   ├── requirements.txt                    fastapi, uvicorn, sqlalchemy, psycopg,
│   │                                       python-dotenv, httpx, pydantic, pytest
│   ├── scripts/
│   │   └── seed_catalog.py                 Generates 6,000 synthetic Product rows
│   └── app/
│       ├── main.py                         FastAPI app, CORS, router wiring, /health
│       ├── config.py                       All env vars in one place
│       ├── db.py                           SQLAlchemy engine/session/Base
│       ├── models.py                       ORM models (7 tables)
│       ├── schemas.py                      Every Pydantic request/response shape
│       ├── deps.py                         get_account_id (auto-creates Account)
│       ├── migrations.py                   Additive ALTER TABLE statements
│       ├── projection.py                   Event fold/replay logic (single source of truth)
│       ├── drift.py                        Deterministic drift-scoring engine
│       ├── profile_ops.py                  Shared profile helpers (used by 2 routers)
│       ├── labels.py                       Anonymous "Shopper-XXXXXXXX" display labels
│       ├── catalog_query.py                Shared SQL filter-condition builder
│       ├── ai/
│       │   ├── groq_client.py              Key-rotation Groq client (shared by all AI calls)
│       │   ├── suggest_name.py             AI profile-name suggestion
│       │   ├── drift_phrasing.py           AI-phrased drift reason
│       │   ├── compile_intent.py           NL → filters compiler (lexicon + validator)
│       │   ├── rank_profiles.py            Semantic Discover search ranking
│       │   └── describe_profile.py         AI one-line description for WhatsApp sharing
│       ├── integrations/
│       │   └── twilio_client.py            Raw httpx WhatsApp sender (no SDK)
│       └── routers/
│           ├── personas.py                 Persona CRUD + global exclusions
│           ├── profiles.py                 Profile CRUD, drift, commit, rollback, share
│           ├── discover.py                 Publish/discover/star/fork/semantic search
│           ├── behaviour.py                Account settings + behavioural suggestion
│           ├── catalog.py                  Coverage advisor + dry-run diff
│           └── ai.py                       suggest-name + compile-intent endpoints
│
├── extension/
│   ├── manifest.json                       MV3 manifest — 3 content scripts + side panel
│   ├── package.json                        5-bundle build pipeline
│   ├── vite.config.ts                      Side panel (real ES module) build config
│   ├── vite.content-scripts.config.ts      Single-entry, non-module builds (4 targets)
│   ├── index.html                          Side panel shell
│   └── src/
│       ├── main.tsx                        Side panel React root
│       ├── App.tsx                         Side panel shell component
│       ├── background.ts                  Service worker (opens side panel on icon click)
│       ├── content-script.ts               Isolated-world: URL watcher + NAVIGATE_TO executor
│       ├── main-world-interceptor.ts       MAIN-world: fetch/XHR patch for gateway signal
│       ├── inpage-panel.ts                 Entry point that mounts the in-page panel
│       ├── panel/                          Side-panel-only React components
│       │   ├── StatusBar.tsx
│       │   ├── ProfileList.tsx
│       │   ├── SaveSheet.tsx
│       │   ├── Timeline.tsx
│       │   ├── ThreeWaySaveModal.tsx
│       │   ├── BehaviourPanel.tsx
│       │   └── GlobalExclusionsPanel.tsx
│       ├── inpage/                         In-page-panel-only React components
│       │   ├── InpageApp.tsx
│       │   ├── FloatingButton.tsx
│       │   ├── SlideOver.tsx               (the popover container, named SlideOver)
│       │   ├── DiscoverPanel.tsx
│       │   ├── CombinedSearch.tsx
│       │   ├── ForkControl.tsx
│       │   ├── retryApply.ts               Zero-results retry/recovery logic
│       │   ├── mount.ts                    Shadow DOM mounting + CSS injection
│       │   ├── inpage.css                  Tailwind entry for the in-page bundle
│       │   └── store/
│       │       └── useInpageStore.ts       Separate Zustand store instance
│       ├── components/                     Shared across BOTH side panel and in-page bundles
│       │   └── ShareButton.tsx             WhatsApp share button (prop-driven, no store access)
│       ├── store/
│       │   ├── useShelfieStore.ts          Side panel's Zustand store
│       │   └── discoverActions.ts          Shared star/fork/fetch-feed logic (both stores call it)
│       ├── adapter/                         Pure-logic modules, shared across every bundle
│       │   ├── urlSchema.ts                Myntra URL ⇄ Constraints (parse + build)
│       │   ├── mergeConstraints.ts         Deterministic patch-merge logic
│       │   ├── navigate.ts                 Single real-tab navigation mechanism
│       │   └── similarity.ts               Client-side fuzzy Discover-feed ranking
│       └── api/
│           ├── client.ts                   Every backend endpoint, one function each
│           └── types.ts                    Every request/response TypeScript type
│
├── start.bat                                Convenience launcher (Windows)
└── README.md
```

**Key structural principle**: this repo intentionally has **five separate build outputs** from one `extension/` source tree (side panel, background, content-script, in-page panel, MAIN-world interceptor), and **two separate Zustand store instances** with zero runtime overlap. This is not incidental complexity — it's a direct consequence of what Chrome's extension security model allows where. Every one of these boundaries is explained in [Section 10](#10-frontend-architecture--five-separate-bundles).

---

## 4. Data Model

All tables live in a single Postgres database (`shelfie`, default `localhost:5433` in dev — see the port-collision note in [Section 16](#16-setup--run-instructions)). Every table after the original four (`accounts`, `personas`, `profiles`, `events`) was added **additively** — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns on pre-existing tables (`migrations.py`), plain `CREATE TABLE` via SQLAlchemy's `create_all()` for wholly new tables. Nothing has ever been dropped or recreated.

```sql
CREATE TABLE accounts (
    account_id                   TEXT PRIMARY KEY,
    created_at                   TIMESTAMPTZ DEFAULT now(),
    behaviour_tracking_enabled    BOOLEAN NOT NULL DEFAULT FALSE   -- added later, additive
);

CREATE TABLE personas (
    persona_id         TEXT PRIMARY KEY,
    account_id         TEXT NOT NULL REFERENCES accounts(account_id),
    name               TEXT NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now(),
    global_exclusions  JSON   -- added later, additive: { brand: [], fabric: [], color: [] }
);

CREATE TABLE profiles (
    profile_id               TEXT PRIMARY KEY,
    persona_id               TEXT NOT NULL REFERENCES personas(persona_id),
    name                     TEXT NOT NULL,
    current_version          INT NOT NULL DEFAULT 1,     -- a PROJECTION, always re-derivable from events
    archived                 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now(),
    visibility               TEXT NOT NULL DEFAULT 'private',   -- 'private' | 'public'
    forked_from_profile_id   TEXT REFERENCES profiles(profile_id),
    forked_from_version      INT
);

CREATE TABLE events (
    event_id     BIGSERIAL PRIMARY KEY,
    profile_id   TEXT NOT NULL REFERENCES profiles(profile_id),
    seq          INT NOT NULL,
    type         TEXT NOT NULL,   -- ProfileCreated | VersionCommitted | RolledBack | ProfileArchived
    payload      JSON NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (profile_id, seq)
);
CREATE INDEX idx_events_profile_seq ON events (profile_id, seq);
CREATE INDEX idx_personas_account   ON personas (account_id);
CREATE INDEX idx_profiles_persona   ON profiles (persona_id, archived);

CREATE TABLE stars (
    account_id   TEXT NOT NULL REFERENCES accounts(account_id),
    profile_id   TEXT NOT NULL REFERENCES profiles(profile_id),
    starred_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (account_id, profile_id)   -- idempotent by construction: insert to star, delete to unstar
);

CREATE TABLE recent_searches (
    id                BIGSERIAL PRIMARY KEY,
    persona_id        TEXT NOT NULL REFERENCES personas(persona_id),
    constraints_hash  TEXT NOT NULL,
    constraints       JSON NOT NULL,
    seen_count        INT NOT NULL DEFAULT 1,
    first_seen_at     TIMESTAMPTZ DEFAULT now(),
    last_seen_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (persona_id, constraints_hash)
);

CREATE TABLE products (               -- SYNTHETIC data, never real Myntra inventory
    product_id     TEXT PRIMARY KEY,
    article_type   TEXT NOT NULL,
    brand          TEXT NOT NULL,
    fabric         TEXT,
    price          NUMERIC NOT NULL,
    primary_color  TEXT,
    sleeve         TEXT,
    neck           TEXT,
    occasion       TEXT,
    sizes          TEXT[]
);
CREATE INDEX idx_products_article_type ON products (article_type);
CREATE INDEX idx_products_price        ON products (price);
CREATE INDEX idx_products_brand        ON products (brand);
CREATE INDEX idx_products_sizes_gin    ON products USING GIN (sizes);   -- array-overlap queries
```

### Why event sourcing, not a mutable `constraints` column

`profiles.current_version` and "the current constraints" are never stored as a directly-mutable field — they are a **projection**, always re-derivable by folding a profile's `events` in `seq` order (`app/projection.py`). This makes three things true that a mutable-column design would not give for free:

1. **Full version history is free** — every `VersionCommitted` event is a permanent record.
2. **Rollback is a real replay, not a hack** — `RolledBack` doesn't rewrite history, it re-folds events up to the target version's commit and continues from there.
3. **Fork is provably safe** — forking reads the source's projected state and writes a brand-new, independent event log; it can never corrupt or even touch the source.

The fold function (`project(events) -> ProfileState | None`) is called from **every single endpoint** that needs current or historical state — there is deliberately no second way to derive it anywhere in the codebase (enforced by centralizing it in `profile_ops.py`, shared by both `routers/profiles.py` and `routers/discover.py`).

---

## 5. Identity Model — No Login, Account-Scoped by Header

There is no username/password system anywhere in this product, by design.

- On first extension load, `crypto.randomUUID()` generates a random account ID, stored in `chrome.storage.local` (`shelfie_account_id`), and cached in memory (`api/client.ts`).
- Every backend request carries this ID as an `X-Account-Id` header.
- `app/deps.py`'s `get_account_id` dependency auto-creates an `accounts` row the first time a given ID is ever seen — there is no explicit "register" endpoint.
- Every persona belongs to exactly one account; every profile belongs to exactly one persona.
- Display names for other people's content (Discover feed owners, fork sources) are a deterministic, anonymous `"Shopper-" + account_id[:8]` (`app/labels.py`) — never a real username, since none exists.

---

## 6. Core Domain Concepts

### `Constraints` — the shared contract (frontend is authoritative)

```ts
interface Constraints {
  category: { articleType: string; gender?: string };
  price: { min: number; max: number };
  brand: { include: string[]; exclude: string[] };
  fabric: { include: string[] };
  sleeve?: { include: string[] };
  neck?: { include: string[] };
  size: { include: string[] };
  color: { include: string[]; exclude: string[] };
  rating?: { min: number };
  occasion?: string;                        // a single string, not an array
  other?: Record<string, string[]>;         // catch-all for unmodeled Myntra facets
}
```

This exact shape (defined once in `extension/src/api/types.ts`, mirrored exactly in `backend/app/schemas.py`'s `Constraints` Pydantic model) is the single source of truth for what a "shopping search" is, everywhere in the system: drift scoring, the URL adapter, the catalog query builder, the NL compiler, the semantic ranker, all of it operate on this one shape.

`other` exists because Myntra exposes 20+ facets per category page (Length, Fashion Trends, Pattern, Print or Pattern Types, Dupatta Fabric, ...) and hand-modeling every one with its own weighted drift field isn't feasible — anything not explicitly named above is preserved verbatim here so a multi-filter search never silently loses data, it's just not scored by drift.

### `ProfileVersion` (`ProfileVersionOut` on the backend)

```ts
interface ProfileVersion {
  id: string;
  name: string;
  version: number;
  personaId: string;
  constraints: Constraints;
  createdAt?: string; updatedAt?: string; archived?: boolean;   // additive bookkeeping
  versionLabel?: string;                    // this version's optional human label
  history?: ProfileHistoryEntry[];          // { version, label?, createdAt? }[] — real history
  visibility?: "private" | "public";
  forkedFromProfileId?: string; forkedFromVersion?: number; forkedFromOwnerLabel?: string;
}
```

### `DriftResponse`

```ts
interface DriftResponse {
  decision: "new_version" | "update" | "new_profile";
  reason: string;                            // deterministic template, optionally AI-phrased
  fieldContributions: Record<string, number>; // never AI-touched — always the real math
}
```

---

## 7. The Drift Engine

Pure, deterministic Python math — **it never calls an LLM**. This is a deliberate design constraint: the save-mode recommendation must be explainable and auditable, not a black box. Only the human-readable phrasing of the `reason` string may optionally be AI-enhanced afterward, and even then the deterministic template underneath is always computed first and used as the fallback.

### Per-field distance functions (`app/drift.py`)

| Field | Distance function |
|---|---|
| `category.articleType` | Exact match: 0 if identical, else 1 |
| `category.gender` | Exact match (excluded from scoring if missing on either side) |
| `brand.include`, `fabric.include`, `color.include`, `size.include`, `sleeve.include`, `neck.include` | Jaccard distance: `1 - |A∩B| / |A∪B|` (0 if both empty) |
| `price` | Range overlap: `1 - overlap/union` where `overlap = max(0, min(maxA,maxB) - max(minA,minB))`, `union = max(maxA,maxB) - min(minA,minB)` (0 if union ≤ 0) |
| `rating` | `min(1, |ratingA.min - ratingB.min| / 5)` (excluded if missing either side) |
| `occasion` | Exact match on the single string (excluded if missing either side) |

### Weights (sum to exactly 1.0)

```python
WEIGHTS = {
    "category.articleType": 0.50,   # deliberately > 0.45 (TAU_HIGH) — a pure category
                                     # change alone always crosses into "new profile"
    "category.gender":      0.08,
    "brand.include":        0.12,
    "price":                0.10,
    "fabric.include":       0.08,
    "color.include":        0.06,
    "size.include":         0.03,
    "sleeve.include":       0.01,   # carved out of an original 0.02 budget
    "neck.include":         0.01,   # when `neck` was added (see Section 14)
    "rating":               0.005,
    "occasion":             0.005,
}
```

### Combining into a score

For every weight whose field is present on **both sides** being compared (optional fields excluded entirely, not treated as zero-distance, if missing on either side):

```
weighted_sum          += distance(field) * weight(field)
total_weight_present  += weight(field)
drift_score = weighted_sum / total_weight_present   (0.0 if nothing was present)
```

### Decision thresholds

```python
TAU_LOW  = 0.10
TAU_HIGH = 0.45

if drift_score >= TAU_HIGH: "new_profile"
elif drift_score >= TAU_LOW: "new_version"
else: "update"
```

### The deterministic reason template

```python
top_field = the field with the largest individual contribution
f"{top_field} changed the most ({contribution} of the signal) — {decision_phrase}."
```
This string is **always computable with zero network calls** and is the guaranteed fallback if the optional AI-phrasing call (`ai/drift_phrasing.py`) fails or is unavailable — `decision` and `fieldContributions` are never touched by AI, only the reason string's wording may be.

---

## 8. AI Integration Layer (Groq)

### The key-rotation client (`app/ai/groq_client.py`)

Every AI call in this system goes through one shared function, `call_groq_structured(system_prompt, user_prompt, schema_name, json_schema, model=None, timeout=8.0)`:

- Maintains up to 4 API keys (`GROQ_API_KEY_1..4`) in a round-robin cycle (`itertools.cycle`).
- On HTTP 429 or 5xx, immediately retries with the **next** key in rotation, up to one attempt per key, with exponential backoff (200ms → 400ms → 800ms) between attempts.
- If every key fails, returns `None` — **every caller must treat `None` as "use the documented deterministic fallback," never surface a raw API error to the user.**
- `model` defaults to `GROQ_MODEL` (env var, default `openai/gpt-oss-20b`) but can be overridden per-call — used by the planner-style calls that wanted a different model without touching the default used everywhere else.
- Checks whether the resolved model is in `GROQ_STRICT_SUPPORTED_MODELS` (currently `openai/gpt-oss-20b`, `openai/gpt-oss-120b`); if yes, uses `response_format: {"type": "json_schema", ..., "strict": true}`; if no, falls back to `{"type": "json_object"}` mode with the schema appended into the prompt text, and parses defensively.

### The five AI touchpoints

| Module | Purpose | Fallback if Groq fails |
|---|---|---|
| `ai/suggest_name.py` | Suggests a profile name + description from its constraints (shown as a chip in `SaveSheet`) | Returns `(None, None)` — frontend shows no chip |
| `ai/drift_phrasing.py` | Rephrases the deterministic drift reason into a friendlier sentence | Returns `None` — the deterministic template is used unchanged |
| `ai/compile_intent.py` | NL sentence → validated `Constraints` patch (see [9.7](#97-nl--filters-compiler)) | Returns an empty patch/provenance — nothing is silently guessed |
| `ai/rank_profiles.py` | Semantic re-ranking of the Discover feed against free text (see [9.9](#99-semantic-discover-search)) | Returns `None` — caller keeps its existing (client-side) ranking |
| `ai/describe_profile.py` | One-sentence shareable description for WhatsApp (see [9.10](#910-whatsapp-sharing-via-twilio)) | Returns a plain deterministic template built from the constraints |

Every one of these follows the same discipline: **propose via Groq, then either use the LLM's structured output directly (already schema-validated) or fall back to something 100% deterministic — never a partial, never a guess, never a raw error surfaced to the user.**

---

## 9. Feature Deep Dives

### 9.1 Personas & Profiles CRUD

- `GET`/`POST /personas` — simple list/create, scoped to the calling account.
- `GET /profiles?personaId=` — every non-archived profile for a persona, each with its live-projected state.
- `GET /profiles/{id}` — single profile's current projected state.
- `POST /profiles` — creates a `ProfileCreated` event (implicit version 1).
- `DELETE /profiles/{id}` — **soft** delete: appends a `ProfileArchived` event and sets `archived=true`; list queries filter `WHERE archived = false`. Never a hard `DELETE`.

### 9.2 Save / Drift / Three-Way Save Modal / Version History / Rollback

1. The content script watches Myntra's URL (both `pushState`/`popstate` for SPA navigation and full reloads) and relays every change to the side panel.
2. `parseUrlToConstraints` turns the URL into a `Constraints` object (see [Section 12](#12-the-myntra-url-adapter--parsing--building)).
3. `StatusBar` shows one of three states: no active profile ("Save as Shopping Profile"), a dirty active profile (click to check drift), or a clean active profile.
4. Clicking a dirty status calls `POST /profiles/{id}/drift`, which runs the drift engine and returns a decision + reason.
5. `ThreeWaySaveModal` shows the AI-phrased (or deterministic) reason, a recommended choice highlighted, and three explicit options:
   - **Create New Version** — `POST /profiles/{id}/commit` with `mode: "new_version"`. Version number is **the historical maximum across all events, plus one** — deliberately not "current projected version + 1" (see the real bug this fixed, [Section 14](#14-real-bugs-found-during-development)).
   - **Update Current** — same endpoint, `mode: "update"`, overwrites the current version number's event in place (no new history entry, replaces the existing one).
   - **Save as New Profile** — creates a genuinely new, independent profile (used via the plain `saveProfile` action, not the commit endpoint's `new_profile` mode, in the current UI).
   - An optional free-text "Label this version" input is available for the first two — it reuses the existing `name` field on the commit request (no new API surface needed) and gets stored as the `label` on that version's event, surfaced later in `Timeline`.
6. A "Preview changes in the catalog" button in the same modal calls `POST /diff` on demand, showing "+N added (mostly {brand}), −M removed" against the synthetic catalog before committing.
7. `Timeline` renders the **real, full** version history (`activeProfile.history`, one entry per version, each with its label if any) with a working "Revert to vN" button on every non-current entry — not an approximation of "current and current-1".
8. Rollback (`POST /profiles/{id}/rollback`) appends a `RolledBack` event; the projection logic replays events only up to the target version's commit and continues fresh from there — genuinely reconstructing history, not decrementing a counter.

### 9.3 Collaboration: Visibility, Discover Feed, Star, Fork

- `PATCH /profiles/{id}/visibility` — toggles `private`/`public`, owner-only.
- `GET /discover` — every public, non-archived profile across **all** accounts, ranked by a **time-decayed score** computed at request time (never stored):
  ```
  score = stars_count / (age_hours + 2) ^ 1.5
  ```
  This prevents an early-popular profile from permanently dominating the feed regardless of how old it gets.
- `POST /discover/{id}/star` — toggles by inserting/deleting the `(account_id, profile_id)` composite-PK row in `stars`. This makes starring **idempotent by construction** — a double-click or retry can never corrupt a counter, because there is no counter; star count is always `COUNT(*)`.
- `POST /discover/{id}/fork` — reads the source's **projected state** (reusing `project()`, never a second implementation), then writes an entirely new, independent `profiles` row + fresh `ProfileCreated` event under the caller's chosen persona, with `forked_from_profile_id`/`forked_from_version` recorded. **Never writes to the source's own event log.** The new profile's version-1 event reuses the existing "label" field on `ProfileCreated` payloads to record `"Forked from {source name} v{source version}"`.
- Private profiles are **genuinely inaccessible** to anyone but the owner — star/fork attempts return `403`, and private profiles never appear in another account's `/discover` feed at all (verified directly, not just hidden client-side).

### 9.4 Behavioural Suggestions

Fully opt-in, off by default (`accounts.behaviour_tracking_enabled`).

- While enabled, `BehaviourPanel` debounces live-constraint changes for **2 full seconds** (deliberately longer than the 600ms name-suggestion debounce — this is meant to catch a *settled* search, not fire on every keystroke) and calls `POST /behaviour/observe`.
- The backend canonicalizes the constraints into a stable hash (`sha256(json.dumps(constraints, sort_keys=True))[:16]`) and upserts into `recent_searches`.
- A **10-minute cooldown**: if the same hash was already seen within the last 10 minutes, only `last_seen_at` bumps — `seen_count` does not increment, so a debounced burst from one real browsing session can't inflate the count.
- Once `seen_count >= 3`, the suggestion would fire — **unless suppressed**: the backend runs `compute_drift` (the same drift engine, no second algorithm) between these constraints and every one of the persona's saved profiles; if any scores below `TAU_LOW` (0.10), the suggestion is suppressed, since there's no point suggesting the user save something they've essentially already saved.
- The frontend nudge ("You've searched this a few times — save it as a profile?") never auto-creates anything — "Save" just scrolls to and highlights the existing `SaveSheet`.

### 9.5 Coverage Advisor & Dry-Run Diff (Synthetic Catalog)

A **synthetic** product catalog (`products` table, 6,000 rows generated by `scripts/seed_catalog.py`, explicitly and repeatedly labeled as synthetic in code, logs, and the UI itself) across 5 article types (`kurtas`, `dresses-for-birthday-women`, `birthday-dresses-for-women`, `nike-shoes`, `sneakers`), reusing vocabulary actually observed in real Myntra testing (brand names, the `Name_hexsuffix` color encoding, etc.) so the numbers feel grounded rather than arbitrary.

- `app/catalog_query.py` builds one shared list of SQL filter conditions from a `Constraints` object, reused by both endpoints below — every condition targets an **indexed** column (`article_type`/`brand`/`price` have btree indexes, `sizes` has a GIN index for the array-overlap `&&` operator used by `size.include`). `category.articleType` is deliberately excluded from the "relaxable" set — suggesting "drop the category" isn't a meaningful relaxation the way "drop the color filter" is.
- `POST /coverage` — counts current matches, then for each other populated field, the count with just that field removed; returns the top 2–3 relaxation suggestions by gain (`{ field, newCount, gain }`). Verified via `EXPLAIN` to actually use Bitmap Index Scans, never a sequential scan.
- `POST /diff` — given old/new constraints, computes `added`/`removed` as SQL `AND-NOT` boolean pairs (`new AND NOT old`, `old AND NOT new` — equivalent to `EXCEPT` on this single table), plus the modal (most frequent) brand among the added set via `GROUP BY`. Never diffs two ID lists in Python.
- Both endpoints accept an optional `?personaId=` to apply that persona's [global exclusions](#96-global-exclusions-tier-3) as always-present `NOT IN` filters.
- Frontend: a non-blocking amber note in `SaveSheet` ("Only N products match — try relaxing X (+M items)"), and an on-demand "Preview changes in the catalog" button in `ThreeWaySaveModal` — both explicitly labeled "(synthetic catalog, for demo purposes)".

### 9.6 Global Exclusions (Tier 3)

Per-persona, persistent "never show me" rules (`personas.global_exclusions`: `{ brand: [], fabric: [], color: [] }`), editable via `GET`/`PATCH /personas/{id}/exclusions`, applied as always-present `NOT IN` conditions inside `catalog_query.build_conditions` whenever a `personaId` is supplied to `/coverage` or `/diff`. Deliberately **not** wired into the drift engine's comparison itself — that connection is thin/ambiguous (drift compares two constraint sets' differences, it doesn't evaluate catalog matches), and this was explicitly the lowest-priority item in scope.

### 9.7 NL → Filters Compiler

**Design discipline: propose then validate, never trust-and-apply.**

- `app/ai/compile_intent.py` maintains a small, hand-written `LEXICON` dict mapping natural-language phrases → concrete constraint values, per field (`articleType`, `gender`, `brand`, `fabric`, `color`, `occasion`, `sleeve`, `neck`, `size`) — values match the vocabulary already used elsewhere in the app (drift fields, the seed catalog) so a validated proposal is guaranteed to mean something to the rest of the system.
- Groq proposes `{attribute, value}` pairs (plus a separate `searchQuery` field — see below); `validate_and_merge` drops **any** proposal whose value doesn't exact-match a lexicon key (case-insensitive) — price is the one special case, validated as "a non-negative number," not lexicon-matched.
- **Myntra-search fallback**: if the LLM can't map a spoken product type onto this app's small `articleType` lexicon (which only covers the synthetic catalog's 5 categories — real Myntra has hundreds), the `searchQuery` field (a concise product-search phrase) gets slugified and used directly as `category.articleType` instead of dropping the request — since Myntra resolves a free-text search through the exact same URL path position as a known category slug. The resulting provenance is marked distinctly (`"... (Myntra search: \"...\")"`) so the UI can show it's a fallback, not a validated filter.
- Verified: a realistic sentence ("pure cotton kurtas under 1500 for school, nothing flashy") correctly extracts category/fabric/occasion/price.max and correctly ignores "nothing flashy" (no lexicon entry); a deliberately nonsense sentence (invented brand, "quantum-inspired") correctly returns an empty patch.

### 9.8 In-Page Discover Panel

A second, independent UI surface, injected directly onto the Myntra page itself (see [Section 10](#10-frontend-architecture--five-separate-bundles) for the full bundle/architecture breakdown):

- `inpage/mount.ts` creates a Shadow DOM host (`#shelfie-inpage-root`, `z-index: 2147483000`) so the panel's own Tailwind styling never leaks into or is polluted by Myntra's page CSS. React only renders **after** the compiled CSS is actually injected into the shadow root (fetched via `chrome.runtime.getURL`), avoiding a window where an unstyled backdrop blocks clicks.
- `FloatingButton` + `SlideOver` (a simple toggleable popover, not a persistent panel — no backdrop, so it can never get stuck open blocking the page).
- `DiscoverPanel` lists public profiles with Star/Fork/​"Apply directly" controls, plus `CombinedSearch` (the "✨ Describe what you want" input).
- **The zero-results retry system** (`inpage/retryApply.ts`), the most sophisticated piece of this surface:
  - `main-world-interceptor.ts` (injected into the page's MAIN world — the only way to see the page's *own* `fetch`/XHR calls, since an isolated-world content script has a completely separate `window`) patches `fetch`/`XHR.open` to detect Myntra's own search-gateway calls (`/gateway/v4/search/...`) and reports the parsed result count back via `postMessage` → the isolated-world content script → a same-page `CustomEvent`.
  - When a filter combination is applied (`applyWithRetry`), the resulting page is watched for either (a) the gateway reporting zero results, or (b) — for navigations that 404 before ever reaching the gateway — a DOM-based check for Myntra's own empty-state text (`"couldn't find any matches"`, etc.) combined with an absence of product-like DOM nodes.
  - On failure, the **least-confident** filter is dropped first (fabric → sleeve → neck → size → occasion → brand → color → finally strip everything but the bare category page) and the URL is retried, up to 5 attempts, state persisted in `sessionStorage` so it survives the resulting page reload.
  - This means an AI-compiled or forked filter combination that happens to use a facet value Myntra doesn't actually recognize self-heals instead of silently leaving the user on a dead page.

### 9.9 Semantic Discover Search

Two layers, working together, in `inpage/CombinedSearch.tsx`:

1. **Instant, offline, client-side** (`adapter/similarity.ts`): a naive stemmer (handles `-ies`/`-es`/`-s` plurals), word-overlap scoring between the sentence's tokens and each profile's flattened "bag of words" (name, article type, brand, fabric, color, occasion), plus field-overlap scoring against the compiled structured patch. Shown immediately on every search so it never feels like it's just sitting there.
2. **Genuine semantic understanding, slower** (`POST /discover/search` → `app/ai/rank_profiles.py`): Groq is given the sentence plus a compact description of every candidate profile, and asked to return a relevance-ordered subset of profileIds — real synonym/concept understanding ("ethnic wear" matching sarees/kurtas, "formal" matching office wear). **Never trusts an invented ID** — the response is filtered down to only IDs that were actually sent. Replaces the client-side ordering once it resolves; a failed/unavailable call is a no-op, the client-side ranking stays.

### 9.10 WhatsApp Sharing via Twilio

- `app/integrations/twilio_client.py` — plain `httpx` + HTTP Basic Auth directly against Twilio's REST Messages API (`POST /2010-04-01/Accounts/{sid}/Messages.json`), matching this codebase's existing convention of talking to a provider directly rather than adding an SDK dependency for one endpoint. Never raises — always returns `(sent: bool, detail: str | None)`.
- `app/ai/describe_profile.py` — a one-sentence, friendly, shareable description of the profile's constraints, same propose-with-deterministic-fallback pattern as every other AI touchpoint.
- `POST /profiles/{id}/share` — shareable if the caller **owns** the profile (at any visibility — WhatsApp sharing is a separate concept from the platform's own public/private toggle) **or** it's someone else's **public** profile (covers sharing both your own profiles and ones found via Discover). The Myntra link is built **client-side** (via the existing `buildUrlFromConstraints`) and passed in, rather than reimplementing Myntra URL construction in Python, which would drift out of sync with the TS version's facet-key fixes. Falls back to a configured default number (`TWILIO_TO_NUMBER`) if the caller doesn't supply one, for one-click demo sharing.
- `components/ShareButton.tsx` — the one React component shared directly between the side-panel bundle and the in-page bundle, because it takes `{profileId, name, constraints}` as plain props and touches neither Zustand store.
- **Known Twilio Sandbox constraint**: the sandbox `From` number only delivers to recipients who have first sent the join code to that number — messages to numbers that haven't done this are accepted by the API (200 OK) but never actually arrive. Not fixable in this app's code.

---

## 10. Frontend Architecture — Five Separate Bundles

Chrome's Manifest V3 security model forces this decomposition; it is not a design choice made for its own sake.

| Bundle | Entry file | Execution context | Why it must be separate |
|---|---|---|---|
| **Side panel** | `index.html` → `main.tsx` | Real ES module page, its own tab-like document | The only surface that's a genuine module graph — Vite/Rollup can freely code-split it |
| **Background** | `background.ts` | Service worker | Opens the side panel on icon click; has no DOM at all |
| **Content script** | `content-script.ts` | Isolated world (extension's own `window`, shares the page's DOM) | Watches `pushState`/`popstate`, executes `NAVIGATE_TO` — has `chrome.*` API access, but its own `window`/`fetch`, separate from the page's |
| **In-page panel** | `inpage-panel.ts` | Isolated world (separate instance from content-script) | A whole React app injected into the page via Shadow DOM — still needs `chrome.*` access (storage, messaging), so it must be isolated-world, not MAIN-world |
| **MAIN-world interceptor** | `main-world-interceptor.ts` | **MAIN world** — the page's own actual JS context | The *only* way to see Myntra's own `fetch`/XHR calls. Trade-off: **zero** `chrome.*` API access here — the only way out is `window.postMessage`, relayed by the isolated-world content script |

Content scripts (and the background worker) must be **classic, non-module scripts** — Chrome refuses `import` statements in them. `vite.content-scripts.config.ts` builds each of the four non-side-panel entries as its own fully separate, single-input Rollup build (`SHELFIE_ENTRY` env var selects which), since Rollup's `codeSplitting: false` still needs a single input to guarantee one self-contained file. `package.json`'s `build` script chains: `tsc -b && vite build && npm run build:background && npm run build:content-script && npm run build:inpage-panel && npm run build:main-world-interceptor && copy manifest.json`.

### Two Zustand stores, zero shared runtime state

`useShelfieStore` (side panel) and `useInpageStore` (in-page bundle) are **completely separate instances** — different bundles, different module graphs, no way to share state directly even though both may be alive in the same tab simultaneously. Where behavior needs to be identical (star/fork/fetch-feed), the *logic* is shared as plain async functions in `store/discoverActions.ts`, called by both stores' action implementations — not the state itself.

Cross-bundle communication, when genuinely needed, goes through `chrome.runtime.sendMessage`: e.g. forking a profile in the in-page panel broadcasts `SHELFIE_PROFILE_FORKED`, which the side panel's `App.tsx` listens for and calls `refreshProfilesForPersona` — so a fork made in one surface shows up in the other without requiring the user to switch personas away and back.

### What's shared, and how

- **Pure logic, no React** (`adapter/`): `urlSchema.ts`, `mergeConstraints.ts`, `navigate.ts`, `similarity.ts` — imported directly by both bundles; Rollup bundles a separate copy into each output, but there's only one implementation to maintain.
- **One React component** (`components/ShareButton.tsx`) — works across bundles specifically because it's prop-driven and touches no store.
- **The API client** (`api/client.ts`, `api/types.ts`) — also imported by both.

---

## 11. Complete API Reference

All endpoints (except `/health`) require an `X-Account-Id` header; the account row is auto-created on first sight.

| Method & Path | Body | Returns | Notes |
|---|---|---|---|
| `GET /health` | — | `{status:"ok"}` | No auth |
| `GET /personas` | — | `{personas: [{id,name}]}` | |
| `POST /personas` | `{name}` | `{id,name}` | |
| `GET /personas/{id}/exclusions` | — | `{globalExclusions}` | |
| `PATCH /personas/{id}/exclusions` | `GlobalExclusions` | `{globalExclusions}` | |
| `GET /profiles?personaId=` | — | `{profiles: ProfileVersion[]}` | Non-archived only |
| `GET /profiles/{id}` | — | `ProfileVersion` | Owner-only |
| `POST /profiles` | `{name,personaId,constraints}` | `ProfileVersion` | Appends `ProfileCreated` |
| `DELETE /profiles/{id}` | — | `{archived:true}` | Soft delete |
| `PATCH /profiles/{id}/visibility` | `{visibility}` | `ProfileVersion` | Owner-only |
| `POST /profiles/{id}/drift` | `{liveConstraints}` | `DriftResponse` | Pure math + optional AI phrasing |
| `POST /profiles/{id}/commit` | `{mode,constraints,name?}` | `{profileId,version,isNewProfile}` | `name` doubles as version label |
| `POST /profiles/{id}/rollback` | `{targetVersion}` | `ProfileVersion` | Real event replay |
| `POST /profiles/{id}/share` | `{channel,toNumber?,myntraLink}` | `{sent,message,detail?}` | Owner (any visibility) or public |
| `GET /discover?limit=&offset=` | — | `{profiles: DiscoverItem[]}` | Time-decayed ranking |
| `POST /discover/search?limit=` | `{sentence}` | `{rankedProfileIds}` | Semantic re-rank, `null` = unavailable |
| `POST /discover/{id}/star` | — | `{starred,starsCount}` | Toggle; 403 if not public |
| `POST /discover/{id}/fork` | `{personaId,name}` | `ProfileVersion` | 403 if not public |
| `GET /accounts/settings` | — | `{behaviourTrackingEnabled}` | |
| `PATCH /accounts/settings` | `{behaviourTrackingEnabled}` | same | |
| `POST /behaviour/observe` | `{personaId,constraints}` | `{suggest,seenCount}` | Only meaningful when tracking is on |
| `POST /coverage?personaId=` | `Constraints` (raw body) | `{currentCount,suggestions}` | Synthetic catalog |
| `POST /diff?personaId=` | `{oldConstraints,newConstraints}` | `{added,removed,total,addedSampleBrand}` | Synthetic catalog |
| `POST /ai/suggest-name` | `{constraints}` | `{suggestedName,suggestedDescription}` | Both null on failure |
| `POST /ai/compile-intent` | `{sentence}` | `{constraints,provenance}` | Propose-then-validate |

---

## 12. The Myntra URL Adapter — Parsing & Building

`extension/src/adapter/urlSchema.ts` is the single most-tested, most-iterated-on file in this project, because it's the actual integration point with a real, undocumented, inconsistent third-party URL scheme. Key facts, all discovered through real browser testing against live Myntra (not assumed):

- **`category.articleType` is the pathname's first segment, verbatim** — and it deliberately **doubles as the literal URL path** when rebuilding a Myntra URL (`https://www.myntra.com/${articleType}`). It is never replaced by the more human-readable `Categories` facet value (e.g. "Sports Shoes"), because that facet value is not a valid path segment — swapping it in would silently break reopening a saved profile. The `Categories` facet is instead preserved in `other`.
- **Facet key names are genuinely inconsistent across category pages.** Discovered the hard way:
  - Fabric: some pages use `Fabric`, most use `Fabric Types` — both accepted on parse.
  - Size: some pages use `Size`, at least one confirmed uses `size_facet` — the builder now writes `size_facet` (the confirmed-correct one after further testing superseded an earlier dual-emit fix), both accepted on parse.
  - Gender: parsed from a `Gender` facet (`men`, `men women`, etc. — Myntra's own encoding) into `category.gender`.
  - Occasions: a comma-separated multi-select facet, joined into `Constraints.occasion`'s single string.
- **Everything else falls into `Constraints.other`** — the parser extracts *every* `key:value` pair from the `f=` query parameter generically, routes the ones explicitly modeled into their typed fields, and preserves the rest verbatim (Length, Fashion Trends, Print or Pattern Types, Dupatta Fabric, etc. have all been seen in real testing) so a multi-filter search never silently loses data.
- **Colors use Myntra's own `Name_hexsuffix` encoding** (e.g. `Black_36454f`, `Grey_808080`) — captured and round-tripped verbatim, and reused as the vocabulary basis for the synthetic catalog's color values.
- **`price` is not yet serialized** — Myntra's price/discount facet format (`rf=`) was never fully reverse-engineered; price constraints are tracked internally but don't yet reach a rebuilt URL. Deliberately left as a known gap rather than guessed at.
- **`buildUrlFromConstraints` and the parser are maintained as exact mutual inverses** — every fix to one was paired with a check against the other, since the round-trip correctness (save → reload → reapply reconstructs the identical filter set) is load-bearing for the entire product.

---

## 13. Security, CORS & Environment Configuration

### CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*",   # side panel, any install/machine
    allow_origins=_explicit_origins or ["http://localhost:5173", "https://www.myntra.com"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Two genuinely different origins need to be allowed, for two different reasons:
- `chrome-extension://<id>` — the side panel's real origin, different per install/machine, hence the regex.
- `https://www.myntra.com` — **not obvious at first**: the in-page panel's `fetch()` calls, despite being extension code, carry the *page's own* origin because content scripts execute fetches in the page's security context. Missing this silently 400s every in-page-panel request with no visible error beyond the browser's own console — this exact gap caused a real "Couldn't reach the Shelfie backend" bug (see [Section 14](#14-real-bugs-found-during-development)).

Neither of these is appropriate for a production AWS deployment as-is — both should be pinned to the real, specific extension ID and origin before any public deployment.

### Environment variables (`backend/.env`, gitignored)

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql+psycopg://shelfie:shelfie@localhost:5433/shelfie` |
| `GROQ_API_KEY_1..4` | Round-robin key pool | — |
| `GROQ_MODEL` | Default model for all AI calls | `openai/gpt-oss-20b` |
| `PORT` | Backend port | `8000` |
| `CORS_ORIGINS` | Extra explicit origins (comma-separated) | `chrome-extension://*` (sentinel, filtered out) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio auth | — |
| `TWILIO_FROM_NUMBER` | WhatsApp sandbox sender | — |
| `TWILIO_TO_NUMBER` | Default share recipient (demo convenience) | — |

`backend/.env.example` mirrors every key with blank placeholders. `.gitignore` excludes `backend/.env`, `backend/__pycache__/`, `backend/.venv`, `backend/*.db`.

**Credential handling note**: real Twilio credentials were provided directly in a chat session during development; they were stored only in the gitignored `.env`, and the user was advised to rotate the Auth Token afterward as good hygiene, since it appeared in plaintext conversation history.

---

## 14. Real Bugs Found During Development

This is a condensed reference; `BACKEND_BUILD_LOG.md`/`FRONTEND_CHANGES_LOG.md` have the full blow-by-blow. Listed because they materially shaped the current design and are worth knowing before changing anything nearby.

1. **`KeyError` on the first `new_version` commit** — `_next_version_number` assumed every `ProfileCreated`/`VersionCommitted` payload has a `"version"` key; `ProfileCreated` doesn't (implicit v1). Fixed by treating it as 1 explicitly. This also validated the deeper design decision that version numbers must be "historical max + 1," not "projected version + 1" — confirmed by a full create→commit→rollback→commit cycle correctly producing v1→v2→(rollback to v1)→v3, never reusing v2.
2. **Only 3–5 of 6+ applied Myntra filters were ever captured**, across several rounds of real-browser testing: `Neck` had no field at all; `Occasions` was never parsed despite the type having it; the fabric facet key was actually `Fabric Types`, not `Fabric`; the size facet key was actually `size_facet` on at least one category, not `Size`. Each was found via a real screenshot of a broken save, not assumed. The generic `other` catch-all was added specifically to stop this class of bug from recurring for every *future* unmodeled facet.
3. **Reopening a saved profile lost filters that WERE captured** — `buildUrlFromConstraints` only wrote back a subset of what the parser could read. Fixed to be an exact mutual inverse of the parser.
4. **"Save Profile does nothing, zero network requests"** — traced to a bare, silent `return` in a guard clause (`if (!activePersona) return;`) with no console output and no user-facing message, triggered because the user hadn't confirmed creating their first persona yet. Fixed by making every guard clause in the store visible (`console.error` + a UI message), a rule that has applied to every action added since.
5. **"Apply to search" (the NL compiler) only updated the panel's internal state, never the real Myntra tab** — it called `loadLiveConstraints` directly instead of navigating. Fixed by extracting the one correct navigation mechanism (`buildUrlFromConstraints` → `NAVIGATE_TO` → hard-navigate fallback) into a single shared `navigateActiveTabTo()`, used everywhere a filter change needs to reach the real page — this also organically resolved a second concern (a stray real URL event clobbering the just-applied patch), since nothing competes to write that state anymore.
6. **Stale backend process serving pre-merge CORS config** — after a teammate's branch merged in the whole in-page-panel architecture (which needed `https://www.myntra.com` added to CORS), the backend process still running had been started *before* that code landed. The fix already existed correctly on disk; the process just needed restarting. General lesson: after **any** git operation that could move HEAD (not just after editing files), restart the backend and verify actual response shape, not just that `/health` returns 200.
7. **Uncommitted work lost to a git operation** — an earlier side-panel step-by-step "AgentBuilder" (planner + per-step validator + pause/resume UI) was built in an earlier session but never `git commit`ed, and was discarded when a teammate's PR landed. The in-page one-shot search (`CombinedSearch`) is the current, committed replacement direction. Lesson: commit meaningful work, don't leave it as uncommitted files across sessions.

---

## 15. Known Limitations & Explicitly Out-of-Scope Items

- **Price filters are not yet serialized into a rebuilt Myntra URL** — tracked internally, not yet round-tripped (Myntra's `rf=` price/discount format was never fully reverse-engineered).
- **No AWS deployment yet** — CORS is currently permissive for local dev (`chrome-extension://*` regex, explicit `myntra.com`), not yet pinned to a real deployed extension ID.
- **The synthetic product catalog is not real Myntra inventory** — explicitly labeled as such everywhere it's surfaced; coverage/diff numbers are directionally illustrative, not real stock counts.
- **Global exclusions are not wired into drift scoring** — only into catalog-based coverage/diff, a deliberate scope line (see [9.6](#96-global-exclusions-tier-3)).
- **No vision-based fallback** for filters the system can't otherwise resolve — considered and explicitly deferred as the highest-risk, lowest-value remaining option.
- **A previous step-by-step agentic profile builder was lost** (see bug #7 above) and has not been rebuilt; the in-page one-shot NL search is the current equivalent feature.
- **Twilio WhatsApp Sandbox** requires each recipient to have opted in via the join code at least once — a platform constraint, not something this app's code can work around.

---

## 16. Setup & Run Instructions

```powershell
# Backend
cd backend
docker compose up -d db            # Postgres 16-alpine on host port 5433
                                    # (a native Postgres on 5432 would otherwise silently
                                    #  intercept connections meant for this container)
.venv\Scripts\python -m venv .venv # first time only
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8000
                                    # do NOT use --reload here — it has been observed to
                                    # silently keep serving stale code after a file change
                                    # in this environment; restart manually after any edit
.venv\Scripts\python -m scripts.seed_catalog   # (re)seed the synthetic product catalog

# Frontend
cd extension
npm install
npm run build                       # produces dist/ with all 5 bundles + manifest.json
# then: chrome://extensions → Developer mode → Load unpacked → extension/dist
```

Both `docs/BACKEND_BUILD_LOG.md` and `docs/FRONTEND_CHANGES_LOG.md` should continue to be updated as a chronological diary going forward; this document should be updated when the *structure* of the system changes, not for every incremental fix.
