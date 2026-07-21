# Shelfie — Master Implementation Document
### The complete, extremely-detailed engineering blueprint (2-person build)

**What this document is:** the single, exhaustive technical spec for building Shelfie end to end — every schema, every endpoint, every algorithm, every file, every UI screen, every day's task list. It synthesizes and expands [Shelfie_Design_Doc_v2.md](Shelfie_Design_Doc_v2.md) (the pitch/product spec) and [Shelfie_Architecture_Explained.md](Shelfie_Architecture_Explained.md) (the teaching explanation) into something you build directly from.

**Who reads what:** this doc is the full picture for whoever wants it (both of you, judges, future-you). For day-to-day work, each person should live mostly in their own role doc — [Shelfie_Person1_Frontend_Extension.md](Shelfie_Person1_Frontend_Extension.md) or [Shelfie_Person2_Backend_AI.md](Shelfie_Person2_Backend_AI.md) — and both should keep [Shelfie_Shared_Contract.md](Shelfie_Shared_Contract.md) open at all times as the integration source of truth. This master doc is where the two role docs both trace back to, and where the full system finally makes sense as one thing.

**Build calendar** (today is **2026-07-21**):
| Day | Date |
|---|---|
| Day 0 | Mon 2026-07-21 (tonight) |
| Day 1 | Tue 2026-07-22 |
| Day 2 | Wed 2026-07-23 |
| Day 3 | Thu 2026-07-24 — **submit by 1:00 PM IST** |

---

## Table of contents

1. [What we're building, one more time](#1-what-were-building-one-more-time)
2. [Why 2 people, not 3 — the role split rationale](#2-why-2-people-not-3--the-role-split-rationale)
3. [Repo structure](#3-repo-structure)
4. [The complete data model](#4-the-complete-data-model)
5. [Full database schema (DDL)](#5-full-database-schema-ddl)
6. [Full API specification](#6-full-api-specification)
7. [Event sourcing engine — full mechanics](#7-event-sourcing-engine--full-mechanics)
8. [Drift engine — full algorithm](#8-drift-engine--full-algorithm)
9. [Fuzzy-intent compiler — full pipeline](#9-fuzzy-intent-compiler--full-pipeline)
10. [Coverage / conflict advisor — full algorithm](#10-coverage--conflict-advisor--full-algorithm)
11. [Fork engine — full mechanics](#11-fork-engine--full-mechanics)
12. [The adapter — full spec](#12-the-adapter--full-spec)
13. [Frontend architecture](#13-frontend-architecture)
14. [Backend architecture](#14-backend-architecture)
15. [Every UI screen, fully specified](#15-every-ui-screen-fully-specified)
16. [System architecture diagram](#16-system-architecture-diagram)
17. [Local dev environment — exact setup](#17-local-dev-environment--exact-setup)
18. [Day-by-day build plan (2-person)](#18-day-by-day-build-plan-2-person)
19. [Testing strategy](#19-testing-strategy)
20. [The 3-minute demo script](#20-the-3-minute-demo-script)
21. [Deployment plan](#21-deployment-plan)
22. [Risk register](#22-risk-register)
23. [Glossary](#23-glossary)

---

## 1. What we're building, one more time

A browser extension that overlays Myntra.com. It reads the user's applied search filters from the URL, lets them save that filter-set as a named, **version-controlled Shopping Profile**, reload it with one click, refine it over time without losing history (event-sourced timeline + rollback), tells them — transparently — when a change is a refinement vs. a brand-new shopping goal (the drift engine), and lets them publish, discover, star, and fork each other's profiles like GitHub repos.

Four defensible pillars (design doc §5): **scrutable recommendation** (inspectable, editable profiles, not black-box embeddings), **event sourcing** (not "like Git" — an actual append-only log with fold/replay semantics), **transparent drift** (a weighted structural distance decides version-vs-new-profile, and the reason is always printable), and **fork/star/discover** (version control's social half, applied to shopping — nobody's done this).

Full product rationale, Bharat framing, feature tiers, and jury Q&A prep live in the design doc — this master doc assumes you've read that and is purely the "how do we build it" companion.

---

## 2. Why 2 people, not 3 — the role split rationale

The design doc's build plan (§17) assumes 3 roles: **BE** (event store + API), **FE** (extension + UX), **ML/Glue** (adapter + drift + compiler + data). With 2 people, the ML/Glue role is absorbed as follows:

- **The adapter** goes to **Person 1 (Frontend)**. It's browser-side TypeScript that lives inside the extension and feeds the side panel directly — it has more in common with "extension plumbing" than with "server-side intelligence," and Person 1 is the one who needs it working first (Day 1's save/reload spine is dead without it).
- **Drift, fuzzy compiler, coverage advisor, catalog seed** go to **Person 2 (Backend)**. These are all pure server-side computation over data Person 2 already owns (the event log, the catalog table) — no browser access needed, and they're most naturally exposed as API endpoints Person 2 already has to build anyway.

Net effect: **Person 1 = "everything that runs in the browser."  Person 2 = "everything that runs on the server, including all the AI/algorithmic pieces."** This is a clean cut with almost zero shared files (see repo structure, §3) — the two of you can work for two full days barely touching the same file, which is exactly what makes 2-person parallel work viable without constant merge pain.

---

## 3. Repo structure

```
shelfie/
├── docs/
│   ├── Shelfie_Design_Doc_v2.md
│   ├── Shelfie_Architecture_Explained.md
│   ├── Shelfie_Implementation_Master.md          (this file)
│   ├── Shelfie_Person1_Frontend_Extension.md
│   ├── Shelfie_Person2_Backend_AI.md
│   └── Shelfie_Shared_Contract.md
├── extension/                     ← Person 1
│   ├── manifest.json
│   ├── vite.config.ts
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── content-script.ts       (injects side panel root into myntra.com)
│       ├── adapter/
│       │   ├── urlSchema.ts        (Myntra URL ⇄ Constraints, §12)
│       │   ├── domFallback.ts      (DOM-only fields, §12.3)
│       │   └── adapter.test.ts
│       ├── store/
│       │   └── useShelfieStore.ts  (Zustand — §13)
│       ├── api/
│       │   ├── client.ts           (fetch wrappers, one per endpoint in contract §9)
│       │   └── types.ts            (TS interfaces mirroring contract §6/§7)
│       └── panel/
│           ├── App.tsx
│           ├── StatusBar.tsx
│           ├── SaveSheet.tsx
│           ├── ThreeWaySaveModal.tsx
│           ├── Timeline.tsx
│           ├── PersonaSwitcher.tsx
│           ├── DiscoverFeed.tsx
│           ├── DeckCard.tsx
│           ├── CoverageBanner.tsx
│           ├── DryRunDiff.tsx
│           ├── FuzzyInput.tsx
│           └── BehaviouralToggle.tsx
├── backend/                       ← Person 2
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── db/
│       │   ├── schema.sql          (§5, run on container init)
│       │   └── session.py
│       ├── models/
│       │   ├── constraints.py      (§4/contract §6)
│       │   └── profile.py          (§4/contract §7)
│       ├── events/
│       │   ├── store.py            (append, read stream)
│       │   ├── project.py          (fold/replay — §7 here)
│       │   └── types.py            (event type catalog — contract §8)
│       ├── routes/
│       │   ├── profiles.py
│       │   ├── drift.py
│       │   ├── compile.py
│       │   ├── coverage.py
│       │   ├── diff.py
│       │   ├── decks.py
│       │   └── behaviour.py
│       ├── drift/
│       │   └── engine.py           (§8)
│       ├── compiler/
│       │   ├── extract.py          (LLM call)
│       │   ├── validate.py         (taxonomy bouncer)
│       │   └── lexicon.py          (fallback dictionary)
│       ├── coverage/
│       │   └── advisor.py          (§10)
│       └── seed/
│           └── generate_catalog.py
└── shared/
    └── fixtures/                   (both — §13 of contract doc)
        ├── sample_profile_version.json
        ├── sample_events_stream.json
        ├── sample_catalog_seed.json
        ├── sample_decks_list.json
        └── sample_drift_response.json
```

This is the canonical layout — both role docs reference these exact paths.

---

## 4. The complete data model

Full detail (types, examples, both-language definitions) lives in [Shelfie_Shared_Contract.md §5–§8](Shelfie_Shared_Contract.md#5-canonical-taxonomy). Summary of the four objects that matter:

1. **`Constraints`** — the typed filter-set. Category, price, brand, fabric, sleeve, size, color, rating, occasion. Every field's legal values come from the canonical taxonomy (contract §5).
2. **`ProfileVersion`** — a derived, read-only snapshot: id, version number, name, description, owner, visibility, `forkedFrom`, stars, `constraints`, optional `softIntent`.
3. **`Event`** — the actual source of truth. `{event_id, profile_id, seq, type, payload, actor, actor_id, ts}`. Never updated or deleted.
4. **`Deck`** — conceptually a `ProfileVersion` with `visibility: "public"`; no separate table needed beyond a couple of denormalized counters (`stars`, `fork_count`) for fast Discover sorting (§5).

**Golden rule:** `ProfileVersion` is never the thing we write. We write `Event`s. `ProfileVersion` is always *computed* by folding events (§7). This is what makes rollback, audit, and fork nearly free — see the architecture-explained doc, Part 6, for the bank-account analogy if this still feels abstract.

---

## 5. Full database schema (DDL)

```sql
-- ============================================================
-- WRITE MODEL (truth) — append-only, never UPDATE or DELETE
-- ============================================================
CREATE TABLE events (
  event_id   TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  seq        INT  NOT NULL,
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  actor      TEXT NOT NULL CHECK (actor IN ('user','ai')),
  actor_id   TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, seq)
);
CREATE INDEX idx_events_profile ON events(profile_id, seq);

-- ============================================================
-- READ MODEL (projection) — disposable, rebuildable from events
-- ============================================================
CREATE TABLE profile_versions (
  profile_id   TEXT NOT NULL,
  version      INT  NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  owner        TEXT NOT NULL,
  persona      TEXT,                        -- persona_amma / persona_divya / persona_arjun
  visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  forked_from  JSONB,                        -- { profileId, version, owner } or null
  query        TEXT NOT NULL,
  constraints  JSONB NOT NULL,
  soft_intent  JSONB,
  created_at   TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL,
  created_by   TEXT NOT NULL CHECK (created_by IN ('user','ai')),
  is_latest    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (profile_id, version)
);
CREATE INDEX idx_profile_versions_owner ON profile_versions(owner);
CREATE INDEX idx_profile_versions_latest ON profile_versions(profile_id) WHERE is_latest;

-- ============================================================
-- SOCIAL
-- ============================================================
CREATE TABLE decks (
  profile_id  TEXT PRIMARY KEY,             -- 1:1 with a public profile
  stars       INT NOT NULL DEFAULT 0,
  fork_count  INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ
);

CREATE TABLE stars (
  user_id     TEXT NOT NULL,
  profile_id  TEXT NOT NULL,
  starred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);

CREATE TABLE forks (
  src_profile_id  TEXT NOT NULL,
  new_profile_id  TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  forked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (new_profile_id)
);

-- ============================================================
-- CATALOG (proxy for the live Myntra shelf — used for coverage/diff counts)
-- ============================================================
CREATE TABLE products (
  id          TEXT PRIMARY KEY,
  article_type TEXT NOT NULL,
  gender      TEXT,
  brand       TEXT NOT NULL,
  fabric      TEXT,
  sleeve      TEXT,
  size        TEXT,
  color       TEXT,
  price       NUMERIC NOT NULL,
  rating      NUMERIC,
  occasion    TEXT
);
CREATE INDEX idx_products_article ON products(article_type);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_price ON products(price);

-- ============================================================
-- IDENTITY (hackathon-grade — no passwords, see contract §11)
-- ============================================================
CREATE TABLE personas (
  id     TEXT PRIMARY KEY,      -- persona_amma
  user_id TEXT NOT NULL,        -- user_amma (account)
  label  TEXT NOT NULL,         -- "Amma"
  emoji  TEXT NOT NULL          -- "👩"
);
```

Rebuild rule for the read model: `TRUNCATE profile_versions; <replay every profile's event stream>;` must always reproduce it exactly. Write a one-off script for this early (Day 1) — it doubles as your first real test of the fold logic.

---

## 6. Full API specification

The endpoint table, request/response shapes, error format, and auth header are all defined once, precisely, in [Shelfie_Shared_Contract.md §9–§11](Shelfie_Shared_Contract.md#9-rest-api-contract) — treat that as canonical and don't let this doc's copy drift from it. Implementation notes (not contract, just build guidance) per endpoint live in [Shelfie_Person2_Backend_AI.md](Shelfie_Person2_Backend_AI.md).

---

## 7. Event sourcing engine — full mechanics

### 7.1 Core operations

```python
def apply(state: dict, event: Event) -> dict:
    """Pure reducer. One case per event type. Never mutates state in place."""
    match event.type:
        case "ProfileCreated":
            return {**EMPTY_STATE, **event.payload, "version": 0}
        case "FilterChanged":
            return set_path(state, event.payload["path"], event.payload["value"])
        case "VersionCommitted":
            return {**state, "version": event.payload["version"]}
        case "RolledBack":
            # handled specially in project() — see 7.3
            return state
        case "ForkedFrom":
            return state  # payload only carries provenance; ProfileCreated follows immediately
    return state

def project(events: list[Event]) -> dict:
    """Fold over the full stream -> current state."""
    state = EMPTY_STATE
    for e in sorted(events, key=lambda e: e.seq):
        state = apply(state, e)
    return state
```

### 7.2 Rollback semantics (important subtlety)

Rollback does **not** delete or rewrite events. It **appends** a `RolledBack` event, and `project()` interprets a `RolledBack` event by re-folding only the prefix up to the target version, then continuing to fold any events *after* the rollback point in the stream as normal:

```python
def project(events: list[Event]) -> dict:
    events = sorted(events, key=lambda e: e.seq)
    state = EMPTY_STATE
    i = 0
    while i < len(events):
        e = events[i]
        if e.type == "RolledBack":
            target_version = e.payload["toVersion"]
            prefix = prefix_up_to_commit(events[:i], target_version)
            state = project(prefix)          # recursive fold of the prefix only
        else:
            state = apply(state, e)
        i += 1
    return state

def prefix_up_to_commit(events: list[Event], version: int) -> list[Event]:
    """All events up to and including the VersionCommitted event for `version`."""
    out = []
    for e in events:
        out.append(e)
        if e.type == "VersionCommitted" and e.payload["version"] == version:
            break
    return out
```

This is the piece worth testing explicitly (§19) — it's the one place a naive "just re-fold everything" implementation gets subtly wrong once a rollback is followed by *new* edits (the demo's "Restore v1, then keep shopping" path).

### 7.3 State at an arbitrary past version

```python
def state_at_version(events: list[Event], v: int) -> dict:
    return project(prefix_up_to_commit(events, v))
```
This is what `GET /profiles/{id}?version=1` calls.

### 7.4 Fork

See §11 (its own section, since it's a named feature) — mechanically it's `state_at_version` on the source stream, replayed as a fresh `ProfileCreated` + `VersionCommitted` pair on a brand-new `profile_id`.

### 7.5 Read model maintenance

After every write to `events`, upsert the corresponding row in `profile_versions` (mark the prior latest row `is_latest = false`, insert the new one `is_latest = true`). Don't try to make this transactional-fancy for a hackathon — a single Postgres transaction wrapping "append event(s) + upsert projection row" is enough.

---

## 8. Drift engine — full algorithm

Full worked derivation and rationale is in the design doc §9 and the architecture-explained doc Part 7 — read those for the *why*. This section is the *exact* algorithm to implement.

```python
WEIGHTS = {
    "category": 0.60,
    "brand":    0.12,
    "fabric":   0.10,
    "price":    0.08,
    "color":    0.05,
    "sleeve":   0.03,
    "size":     0.02,
}

TAU_LOW  = 0.10
TAU_HIGH = 0.45

VERTICAL_OF = {  # articleType -> taxonomy vertical, per contract §5
    "kurta": "ethnic_wear", "kurti": "ethnic_wear", "saree": "ethnic_wear", "lehenga": "ethnic_wear",
    "t_shirt": "western_wear", "shirt": "western_wear", "jeans": "western_wear",
    "trousers": "western_wear", "dress": "western_wear", "jacket": "western_wear",
    "running_shoes": "footwear", "sneakers": "footwear", "sandals": "footwear", "formal_shoes": "footwear",
}

def jaccard_distance(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return 1 - len(a & b) / len(union)

def range_distance(a: tuple[float,float], b: tuple[float,float]) -> float:
    lo = max(a[0], b[0]); hi = min(a[1], b[1])
    overlap = max(0, hi - lo)
    union = max(a[1], b[1]) - min(a[0], b[0])
    if union == 0:
        return 0.0
    return 1 - overlap / union

def category_distance(p_type: str, l_type: str) -> float:
    if p_type == l_type:
        return 0.0
    if VERTICAL_OF.get(p_type) == VERTICAL_OF.get(l_type):
        return 0.3          # within-vertical category change (kurta -> kurti), not a full jump
    return 1.0               # crosses a taxonomy vertical

def compute_drift(P: Constraints, L: Constraints) -> dict:
    contributions = {}
    contributions["category"] = WEIGHTS["category"] * category_distance(
        P.category.articleType, L.category.articleType)
    contributions["brand"] = WEIGHTS["brand"] * jaccard_distance(
        set(P.brand.include), set(L.brand.include))
    contributions["fabric"] = WEIGHTS["fabric"] * jaccard_distance(
        set(P.fabric.include), set(L.fabric.include))
    contributions["price"] = WEIGHTS["price"] * range_distance(
        (P.price.min, P.price.max), (L.price.min, L.price.max))
    contributions["color"] = WEIGHTS["color"] * jaccard_distance(
        set(P.color.include), set(L.color.include))
    contributions["sleeve"] = WEIGHTS["sleeve"] * jaccard_distance(
        set((P.sleeve or {}).get("include", [])), set((L.sleeve or {}).get("include", [])))
    contributions["size"] = WEIGHTS["size"] * jaccard_distance(
        set(P.size.include), set(L.size.include))

    D = sum(contributions.values())
    vertical_changed = VERTICAL_OF.get(P.category.articleType) != VERTICAL_OF.get(L.category.articleType)

    if vertical_changed:
        decision, reason = "new_profile", (
            f"Category changed: {VERTICAL_OF.get(P.category.articleType)} -> "
            f"{VERTICAL_OF.get(L.category.articleType)} (dominant signal)")
    elif D >= TAU_HIGH:
        decision, reason = "new_profile", f"Combined change is large (drift={D:.2f})"
    elif D >= TAU_LOW:
        decision, reason = "new_version", f"Refinement detected (drift={D:.2f})"
    else:
        decision, reason = "update", f"Minor tweak (drift={D:.2f})"

    return {
        "distance": round(D, 3),
        "decision": decision,
        "reason": reason,
        "fieldContributions": {k: round(v, 3) for k, v in contributions.items()},
    }
```

**Worked examples to test against** (design doc §9.5 — these numbers must come out of your implementation, or something's wrong):

| Change | Expected D | Expected decision |
|---|---|---|
| Libas → Aurelia (brand only) | ≈0.12 | `new_version` |
| ₹1500 → ₹1800 (price only) | ≈0.016 | `update` |
| +maroon, +Aurelia, ₹1800 | ≈0.19 | `new_version` |
| Kurta → Nike running shoes | vertical override | `new_profile` |

---

## 9. Fuzzy-intent compiler — full pipeline

Full rationale in design doc §10 / architecture-explained Part 8. Pipeline, precisely:

```
raw text
   │
   ▼
[1] EXTRACT — LLM call, structured-output prompt, proposes (attribute, value, polarity) triples
   │           e.g. "nothing flashy, for school" ->
   │             [{attr:"color", value:"neon", polarity:"exclude"},
   │              {attr:"color", value:"sequins", polarity:"exclude"},
   │              {attr:"occasion", value:"workwear", polarity:"include"}]
   ▼
[2] VALIDATE — deterministic taxonomy check (contract §5), NOT an LLM call
   │           drop any triple whose (attr, value) pair isn't in the canonical taxonomy
   ▼
[3] APPLY — merge validated triples into `constraints`; record the mapping in
             softIntent.compiledTo for display (scrutability)
```

**Extraction prompt shape** (implementation detail, tune freely, keep the *contract* — structured JSON out — fixed):
```
System: Extract shopping-filter triples from the user's sentence. Only propose an
attribute from this list: {articleType, gender, brand, fabric, sleeve, size, color,
occasion, price}. Output strict JSON: a list of {attr, value, polarity}. Do not
invent values outside common sense; the validator will reject anything illegal, so
propose freely but only in the given attributes.

User: "pure cotton kurtas under 1500 for school, nothing flashy"
```

**Validator** — deterministic, no LLM, pure Python, checks each proposed `(attr, value)` against the taxonomy in contract §5 (case-insensitive, simple synonym table below), drops anything that doesn't match:

```python
def validate_triple(attr: str, value: str) -> bool:
    return value.lower() in {v.lower() for v in TAXONOMY.get(attr, [])}
```

**Lexicon fallback** (used identically whether the LLM is up or down — it's not just a fallback, it's the seed of the extraction prompt's few-shot examples too):
```python
LEXICON = {
    "flashy":  [("color", "neon", "exclude"), ("color", "sequins", "exclude"), ("color", "metallic", "exclude")],
    "office":  [("occasion", "workwear", "include")],
    "school":  [("occasion", "workwear", "include")],
    "teacher": [("occasion", "workwear", "include")],
    "summery": [("fabric", "cotton_blend", "include"), ("fabric", "linen", "include")],
    "breathable": [("fabric", "pure_cotton", "include"), ("fabric", "linen", "include")],
    "cheap":   [("price", "max=p30", "include")],       # resolved against catalog percentile at runtime
    "sasta":   [("price", "max=p30", "include")],
    "premium": [("price", "min=p70", "include")],
}
```
**LLM down:** skip step 1 entirely, run the raw text through a simple keyword match against `LEXICON` only. Filters-first UX is unaffected either way (design doc §10, fallback line).

---

## 10. Coverage / conflict advisor — full algorithm

Full rationale in design doc §6 (A2) / architecture-explained Part 9.

```python
def coverage_advice(constraints: Constraints, db) -> dict:
    base_count = query_count(constraints, db)
    suggestions = []
    for field in RELAXABLE_FIELDS:   # brand, fabric, sleeve, size, color, price(widen), rating(lower)
        relaxed = relax(constraints, field)   # drop the field's include-list / widen the range
        new_count = query_count(relaxed, db)
        gain = new_count - base_count
        if gain > 0:
            suggestions.append({"field": field, "ifRemoved": new_count, "gain": gain})
    suggestions.sort(key=lambda s: -s["gain"])
    return {"count": base_count, "suggestions": suggestions[:3]}
```
`query_count` is a plain `SELECT COUNT(*) FROM products WHERE ...` built from the constraint object (straightforward WHERE-clause construction — no ORM cleverness needed). This endpoint is pure counting, no ML, and should be one of the fastest things to build and demo.

---

## 11. Fork engine — full mechanics

Full narrative and diagram in design doc §15.3 / architecture-explained Part 12. Exact operation:

```python
def fork(src_profile_id: str, src_version: int, new_owner: str, new_persona: str | None) -> str:
    src_events = load_events(src_profile_id)
    base_state = state_at_version(src_events, src_version)   # §7.3

    new_profile_id = generate_id("prof")
    write_event(new_profile_id, seq=1, type="ForkedFrom",
                payload={"srcProfileId": src_profile_id, "srcVersion": src_version,
                         "srcOwner": load_owner(src_profile_id)},
                actor="user", actor_id=new_owner)
    write_event(new_profile_id, seq=2, type="ProfileCreated",
                payload={"name": base_state["name"], "query": base_state["query"],
                         "constraints": base_state["constraints"], "visibility": "private"},
                actor="user", actor_id=new_owner)
    write_event(new_profile_id, seq=3, type="VersionCommitted", payload={"version": 1},
                actor="user", actor_id=new_owner)

    upsert_projection(new_profile_id)                # rebuild read model row for the new profile
    increment_fork_count(src_profile_id)              # decks.fork_count += 1
    insert_fork_record(src_profile_id, new_profile_id, new_owner)
    return new_profile_id
```

Note the fork is **private by default** on creation — the user explicitly re-publishes if they want their fork public too. No shared mutable state between source and fork from this point on; they're two completely independent event streams (this is *why* fork needs no merge logic — see design doc §12.2 for the "why this sidesteps CRDTs" argument, useful verbatim for jury Q&A).

---

## 12. The adapter — full spec

Full spec (repo path, TS interfaces, worked example) lives in [Shelfie_Person1_Frontend_Extension.md §6](Shelfie_Person1_Frontend_Extension.md) since it's entirely Person 1's build. The URL scheme contract itself (placeholder + verification protocol) is canonical in [Shelfie_Shared_Contract.md §12](Shelfie_Shared_Contract.md#12-the-myntra-url-contract) — that section is what both people must treat as binding, this master doc doesn't duplicate it to avoid drift.

---

## 13. Frontend architecture

### 13.1 Zustand store shape
```ts
interface ShelfieState {
  currentUser: string;                 // "user_amma"
  activePersona: string;               // "persona_amma"
  activeProfile: ProfileVersion | null;
  liveConstraints: Constraints | null; // read from the adapter on every URL change
  isDirty: boolean;                    // liveConstraints != activeProfile.constraints
  driftResult: DriftResponse | null;
  profiles: ProfileVersion[];          // this persona's saved profiles
  decks: ProfileVersion[];             // Discover feed cache
  behaviourSuggestOptIn: boolean;

  setActivePersona: (id: string) => void;
  loadLiveConstraints: (c: Constraints) => void;
  saveProfile: (mode: "new_version" | "update" | "new_profile", name?: string) => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;   // triggers adapter write-path navigation
  rollback: (profileId: string, toVersion: number) => Promise<void>;
  forkDeck: (deckId: string) => Promise<void>;
  toggleStar: (deckId: string) => Promise<void>;
}
```

### 13.2 Component tree
```
<App>
 ├─ <PersonaSwitcher>
 ├─ <StatusBar>                     (clean / dirty / no-profile states)
 ├─ <ProfileList>
 │    └─ <ProfileListItem> ×n
 ├─ <SaveSheet>                     (shown on "Save as Shopping Profile")
 ├─ <ThreeWaySaveModal>             (shown when dirty + user saves)
 │    ├─ <DryRunDiff>
 │    └─ (drift reason + 3 radio options)
 ├─ <Timeline>                      (per active profile)
 ├─ <CoverageBanner>                (conditionally rendered, low-count warning)
 ├─ <FuzzyInput>                    (NL entry box)
 ├─ <DiscoverFeed>
 │    └─ <DeckCard> ×n
 └─ <SettingsPanel>
      └─ <BehaviouralToggle>
```
Full per-component behavior spec is in the Person 1 doc §8.

---

## 14. Backend architecture

### 14.1 FastAPI module map
```
main.py            → app factory, CORS, router registration, /health
routes/profiles.py → POST/GET /profiles, GET/POST /profiles/{id}/*
routes/drift.py     → POST /drift
routes/compile.py   → POST /compile
routes/coverage.py  → POST /coverage
routes/diff.py      → POST /diff
routes/decks.py     → GET /decks, POST /decks/{id}/star, POST /decks/{id}/fork
routes/behaviour.py → POST /behaviour/suggest
events/store.py      → append_event(), load_events()
events/project.py    → apply(), project(), state_at_version(), rollback fold (§7)
drift/engine.py       → compute_drift() (§8)
compiler/*             → extract/validate/lexicon (§9)
coverage/advisor.py    → coverage_advice() (§10)
seed/generate_catalog.py → one-off script, run once at container init
```
Full endpoint-by-endpoint implementation guidance is in the Person 2 doc.

---

## 15. Every UI screen, fully specified

All 10 "user boards" (save, reload, 3-way save, timeline/rollback, persona switcher, dry-run diff, coverage advisor, fuzzy input, behavioural suggestion, discover/fork) are specified narratively with exact copy and mockups in the architecture-explained doc, Part 10 — treat those as the UX spec verbatim (copy text, button labels, states). The Person 1 doc turns each into a component build task with props/state detail.

---

## 16. System architecture diagram

```
┌───────────────────────────── BROWSER (myntra.com) ─────────────────────────────┐
│  Myntra page (their DOM/URL/search) ⇄ ADAPTER (Person 1) ⇄ Side panel (React)   │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                        │ REST/JSON, X-User-Id header
                                        ▼
┌────────────────────────────── FastAPI (Person 2) ───────────────────────────────┐
│ routes/*  →  events engine, drift engine, compiler, coverage, fork              │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                        ▼
┌────────────────────────────── PostgreSQL (Person 2) ────────────────────────────┐
│ events (write/truth) · profile_versions (read) · decks/stars/forks · products   │
└───────────────────────────────────────────────────────────────────────────────────┘
```
(Full annotated version with every arrow labeled is in the design doc §14.)

---

## 17. Local dev environment — exact setup

**Backend (Person 2), from `backend/`:**
```bash
cp .env.example .env            # fill in DATABASE_URL, LLM key
docker-compose up --build       # postgres + fastapi, schema.sql runs on first boot
python -m app.seed.generate_catalog   # one-off, seeds ~5-20k products
# Swagger UI at http://localhost:8000/docs — test every endpoint without the extension
```

**Frontend (Person 1), from `extension/`:**
```bash
cp .env.example .env            # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run build                   # outputs to extension/dist
# Chrome: chrome://extensions -> Developer mode -> "Load unpacked" -> select extension/dist
# Reload the unpacked extension after each `npm run build` to see changes
```
`npm run dev` (Vite dev server, hot reload) is useful for iterating on panel components in isolation, but the extension itself must be tested via the unpacked build periodically since the dev server doesn't run inside the MV3 side panel context.

---

## 18. Day-by-day build plan (2-person)

Adapted from design doc §17, redistributed from 3 roles to 2. Every risky step keeps its fallback.

### Day 0 — tonight, Mon 2026-07-21 (2–3 hrs)
| Person | Task | Fallback |
|---|---|---|
| **P1** | **Verify Myntra's real URL filter encoding** (contract §12) — do this literally first | If some facets are DOM-only, document them as special cases; don't let this block the extension skeleton |
| **P1** | Extension skeleton: MV3 manifest, content script injecting a placeholder side panel | If MV3 side panel API fights you, fall back to a simple injected `<div>` overlay |
| **P2** | `docker-compose up` bringing Postgres + FastAPI; `schema.sql` applied; `/health` returns 200 | Run Postgres + `uvicorn` locally without Docker if Compose fights you |
| **P2** | Seed script skeleton + canonical taxonomy (contract §5) locked in code | Generate catalog from attribute permutations if hand-curated data takes too long |
| **Both** | Read and confirm the Shared Contract doc; both `.env.example` files filled | — |

### Day 1 — Tue 2026-07-22 — the spine
| Person | Task | Fallback |
|---|---|---|
| **P1** | Adapter read path (URL → `Constraints`) and write path (`Constraints` → URL → navigate) | If write-navigation is flaky, ship read+display first; "reload" can copy the URL to clipboard as a stopgap |
| **P1** | Side panel: status bar + `ProfileList` + `SaveSheet`, wired to real or mocked `/profiles` | Use `shared/fixtures/` mocks (contract §13) if backend isn't ready yet |
| **P2** | `events` table + `apply`/`project` (§7.1) + `POST /profiles`, `GET /profiles`, `GET /profiles/{id}` | If full event-log plumbing is slow, store `ProfileVersion` rows directly today and retrofit events Day 2 — but try hard to do it properly now, since rollback/fork depend on it |
| **Both** | **EOD1 checkpoint (contract §14):** real Myntra search → Save as Profile → reload → filters restored via URL, against the real API | If real API isn't ready, this slips to Day 2 morning — flag immediately |

### Day 2 — Wed 2026-07-23 — the innovation
| Person | Task | Fallback |
|---|---|---|
| **P1** | Dirty-state badge + `ThreeWaySaveModal` + `Timeline` + Restore button | A simple version list + Restore buttons suffices if the modal's polish slips |
| **P2** | `VersionCommitted`/`RolledBack` events, `/profiles/{id}/commit`, `/rollback`, `/timeline`; **drift engine** (§8) + `/drift` | If rollback-via-replay proves tricky under time pressure, "restore" can be implemented as "commit a new version copying the old constraints" — same UX, simpler mechanics |
| **P2** | Hardcode the category-vertical override rule first if full weighted distance is slow to land — it alone covers the headline demo moment (kurta→shoes) | — |
| **Both** | **EOD2 checkpoint:** modify active profile → correct, explained 3-way save → save v2 → rollback to v1 → shelf reverts live | — |

### Day 3 — Thu 2026-07-24 — social slice, polish, demo (submit 1:00 PM IST)
| Person | Task | Fallback |
|---|---|---|
| **P1** | `DiscoverFeed` + `DeckCard` + star + fork buttons + `PersonaSwitcher` + visual polish pass | Persona switcher can be a hardcoded 3-item dropdown (it already is, per contract §11) — don't over-engineer |
| **P1** | `CoverageBanner`, `DryRunDiff`, `FuzzyInput`, `BehaviouralToggle` — wire whichever backend endpoints are ready | Cut in this order if short on time: `BehaviouralToggle` (S1) first, then amplifiers (`DryRunDiff`, `CoverageBanner`), never the core save→reload→version→rollback loop |
| **P2** | `/decks`, `/star`, `/fork` (real event-log replay, §11) | Fork can copy only the latest version (skip full-history replay) if time is short — still demoable |
| **P2** | `/coverage` (§10), `/compile` (§9) | **Biggest fallback:** ship the lexicon-only compiler (no LLM call) if the LLM integration is shaky — the validator is the impressive, defensible part and needs no LLM to demonstrate |
| **P2** | Deploy: push image to Render/Railway, confirm public URL, swap `VITE_API_BASE_URL` in the packaged extension | Judges can still run everything locally via Docker Compose if hosting falls through — say so proactively, it reads as maturity, not as a failure |
| **Both** | **Hard integration freeze ~4-5 hrs before submission.** Record the 3-min demo video (§20) against the frozen build. Package the extension as `.crx` or leave it loadable unpacked for judges. | Video-first: a recorded demo is a submittable artifact even if live judging hits a snag |

**Sequencing rule, unchanged from the design doc:** build vertically — one thin slice fully working before adding depth. If behind schedule, cut in this order: behavioural toggle → amplifiers (dry-run diff, coverage advisor) → social slice (Discover/star/fork) → **never** the core save→reload→version→rollback loop. That loop is the whole pitch.

---

## 19. Testing strategy

No time for a full test pyramid in 3 days — spend testing effort where a bug would be visible *in the live demo*, not where it's merely "untested."

| Priority | What | How |
|---|---|---|
| **P0** | Rollback-then-continue-editing (§7.2) | Unit test: create v1, v2, rollback to v1, add a new filter change, commit v2-again → assert the new v2 does **not** contain the rolled-back-away v2 state |
| **P0** | Drift worked examples (§8) | Unit test against the exact 4 rows in the table in §8 — these numbers are also what you say out loud in the demo, so they must be right |
| **P0** | Adapter round-trip | Given a `Constraints` object, write→URL→read must reproduce the same object (property-style test, even just 5-6 hand-written cases covering each field type) |
| **P1** | Fork produces an independent stream | Fork a profile, mutate the fork, assert the source's projection is unchanged |
| **P1** | API error shape | Every route tested once for its 4xx path, confirming the `{error:{code,message}}` shape (contract §10) |
| **P2** | Coverage advisor suggestion ordering | Suggestions sorted by descending gain |
| **P2** | Compiler validator rejects illegal values | Feed it a triple with a nonsense value, assert it's dropped, not applied |

Run the **full demo script (§20) live, end-to-end, at least 3 times** before Day 3 evening — this catches more real bugs than any unit test will, because it's literally the path judges see.

---

## 20. The 3-minute demo script

Verbatim from the design doc §18 (this is the pitch-tested version — don't rewrite it, rehearse it):

1. **(0:00–0:25) Pain.** Lakshmi the schoolteacher stacks 8-12 filters on real Myntra. Closes tab. Gone. Next week, rebuild from scratch.
2. **(0:25–0:55) Save the route.** Rebuild, **Save as Shopping Profile → "School Wear"**. Reopen Myntra, one click → real shelf returns via URL.
3. **(0:55–1:40) Living, versioned.** Libas→Aurelia → amber Unsaved badge. Save → 3-way modal, New Version pre-selected, reason shown. Preview diff. Save v2. Timeline → Restore v1 → shelf snaps back live.
4. **(1:40–2:10) New-intent moment.** Search Nike shoes with School Wear active → "New shopping goal" banner, reason shown. New profile created, old one untouched.
5. **(2:10–2:40) GitHub for shopping + Bharat.** Discover → fork a public deck → tweak → save own version. Switch persona Amma→Divya → separate profiles.
6. **(2:40–3:00) Line.** "We turned the finished search from disposable into durable, and made it shareable. And it runs on Myntra today."

Record this early on Day 3 (per the build plan) — a recorded artifact beats a live-only demo that might glitch.

---

## 21. Deployment plan

- **Backend:** Docker Compose locally for dev; push to **Render or Railway** for a public URL Day 3 (design doc §13.2). One command bring-up (`docker-compose up`) is the fallback judges can run themselves if hosting is unreachable — mention this proactively.
- **Frontend:** load unpacked in Chrome/Edge for live judging (`chrome://extensions` → Developer mode → Load unpacked), or pack as a `.crx` for distribution. No Chrome Web Store submission needed or expected for a hackathon timeline.
- **Database:** whatever Postgres instance Render/Railway provisions; run `schema.sql` + the seed script once against it before demo day.

---

## 22. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Myntra's real URL encoding is messier than expected (e.g., POST-only facets) | Medium | High | Verify Day 0 first thing (contract §12); DOM fallback documented as an isolated special case |
| Event-log rollback-then-edit logic has a subtle bug | Medium | High | Dedicated unit test (§19 P0); rehearse this exact demo beat multiple times |
| LLM API flaky/slow/rate-limited on demo day | Medium | Medium | Lexicon-only fallback (§9) requires no LLM and still demonstrates the validator, which is the actually-defensible part |
| Docker/hosting friction on Day 3 | Medium | Medium | Local Docker Compose always works as a backup; say so to judges rather than hiding it |
| Running out of time for the social slice (Discover/fork) | Medium | Medium | Explicitly the first thing to cut per the sequencing rule (§18) — core loop is non-negotiable, this is |
| Two people accidentally diverge on a schema field | Low if contract doc is followed | High | Shared Contract doc (§16 "changing this contract") — this is the entire reason that document exists |

---

## 23. Glossary

Full glossary (21 terms, plain-language) is in the design doc §21 and the architecture-explained doc's jargon call-outs throughout — not duplicated here to avoid drift. Key terms specific to the *build* (not the pitch): **fold/replay**, **projection/read model**, **CQRS**, **taxonomy vertical**, **Jaccard distance** — see design doc §21 for all of these defined precisely.

---

*This is the complete picture. For day-to-day execution, work from [Shelfie_Person1_Frontend_Extension.md](Shelfie_Person1_Frontend_Extension.md) or [Shelfie_Person2_Backend_AI.md](Shelfie_Person2_Backend_AI.md), and keep [Shelfie_Shared_Contract.md](Shelfie_Shared_Contract.md) open as the integration source of truth. Build vertically, freeze early, demo one clear story — on the live site.*
