# Shelfie — Shared Interface Contract
### The single point of truth for Person 1 (Frontend + Extension) and Person 2 (Backend + AI)

**Read this before writing a line of integration code. If your code disagrees with this file, this file wins — fix your code, or fix this file and tell the other person in the same breath.**

Team: **2 people, working in parallel, starting tonight.**
- **Person 1 (FE)** — owns the browser extension: adapter, side panel UI, state management, everything the user clicks.
- **Person 2 (BE)** — owns everything server-side: API, database, event sourcing, drift engine, fuzzy compiler, coverage advisor, catalog, deployment.

Real build calendar (today is **2026-07-21**):
| Day | Date | Theme |
|---|---|---|
| Day 0 | Mon 2026-07-21 (tonight) | Setup, scaffolding, contract lock |
| Day 1 | Tue 2026-07-22 | The spine: save → reload, end to end |
| Day 2 | Wed 2026-07-23 | The innovation: versions, rollback, drift |
| Day 3 | Thu 2026-07-24 | Social slice, polish, demo, **submit by 1:00 PM IST** |

---

## Table of contents

1. [Rules of engagement](#1-rules-of-engagement)
2. [Ownership boundary](#2-ownership-boundary)
3. [Repo layout](#3-repo-layout)
4. [Environment & config](#4-environment--config)
5. [Canonical taxonomy (the enums both sides must agree on)](#5-canonical-taxonomy)
6. [Canonical constraint schema](#6-canonical-constraint-schema)
7. [ProfileVersion — the full object](#7-profileversion--the-full-object)
8. [Event log schema & event type catalog](#8-event-log-schema--event-type-catalog)
9. [REST API contract](#9-rest-api-contract)
10. [Error format & status codes](#10-error-format--status-codes)
11. [Auth / user identification (hackathon-grade)](#11-auth--user-identification)
12. [The Myntra URL contract (adapter ⇄ backend agreement)](#12-the-myntra-url-contract)
13. [Working independently: mocking the other side](#13-working-independently-mocking-the-other-side)
14. [Daily integration checkpoints](#14-daily-integration-checkpoints)
15. [Git workflow](#15-git-workflow)
16. [Changing this contract](#16-changing-this-contract)
17. [Definition of done, per day, both sides](#17-definition-of-done-per-day-both-sides)
18. [Escalation](#18-escalation)

---

## 1. Rules of engagement

1. **This file is the contract.** Field names, types, endpoint shapes, event types, and enum values here are binding. Neither side invents a field the other doesn't know about without updating this file first.
2. **JSON keys are camelCase everywhere** — extension, API request/response, event payloads. No snake_case leaking into JSON (Postgres columns are snake_case internally per SQL convention, but the API layer converts).
3. **All timestamps are ISO-8601 UTC** with a trailing `Z`, e.g. `2026-07-21T18:30:00Z`.
4. **All IDs are strings, prefixed by type**: `user_…`, `prof_…`, `deck_…` (a deck is just a public profile, so `deck_id == profile_id`), `ev_…` for event ids. Generate with a short random suffix (e.g. `nanoid(8)`), not sequential ints, so fork/demo data doesn't collide.
5. **Nobody blocks on the other person.** Section 13 tells you exactly how to build against a fake version of the other side so you're never idle waiting for an API or a UI to exist.
6. **If you must deviate from this contract mid-build** (you will — that's normal), edit this file in the same commit as your code change, and say so in your next sync message (§14). Silent drift here is the one thing that will actually sink the demo.

---

## 2. Ownership boundary

| Area | Owner | Notes |
|---|---|---|
| Extension manifest, content script, side panel | **Person 1** | |
| Adapter (Myntra URL ⇄ constraints) | **Person 1** | Lives in the browser; it's extension code even though it's "the ML-flavored" piece conceptually |
| All React/Zustand UI | **Person 1** | |
| API client calls from extension | **Person 1** | Implements calls *against this contract*; doesn't need Person 2's server running to write the calling code (§13) |
| FastAPI app, all routes | **Person 2** | |
| PostgreSQL schema, migrations | **Person 2** | |
| Event sourcing engine (fold/replay/rollback/fork) | **Person 2** | |
| Drift engine | **Person 2** | |
| Fuzzy compiler (LLM + validator) | **Person 2** | |
| Coverage advisor | **Person 2** | |
| Catalog seed data | **Person 2** | Must use the taxonomy in §5 — Person 1's adapter maps to the *same* taxonomy, so if Person 2 changes it, Person 1's mapping breaks |
| Deployment (Docker Compose, hosted API) | **Person 2** | |
| Demo video / pitch deck | **Both** | Content from both sides; edit together Day 3 |
| Verifying Myntra's real URL filter encoding | **Person 1** | Highest-risk unknown in the whole project — do this literally first, tonight (§12) |

---

## 3. Repo layout

Single monorepo, two top-level folders so git history and file ownership stay obviously separated — minimizes merge conflicts since you're almost never editing the same file.

```
shelfie/
├── docs/                        # this doc + the 3 others
├── extension/                   # Person 1's entire world
│   ├── manifest.json
│   ├── src/
│   │   ├── adapter/
│   │   ├── panel/                (React app)
│   │   ├── store/                (Zustand)
│   │   ├── api/                  (client calling backend)
│   │   └── content-script.ts
│   ├── vite.config.ts
│   ├── package.json
│   └── .env.example
├── backend/                     # Person 2's entire world
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   ├── events/
│   │   ├── drift/
│   │   ├── compiler/
│   │   ├── coverage/
│   │   ├── models/                (Pydantic schemas — mirrors §6/§7 exactly)
│   │   └── db/                    (SQL, migrations, seed script)
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── shared/
│   └── fixtures/                # sample JSON payloads BOTH sides use for mocking (§13)
│       ├── sample_profile_version.json
│       ├── sample_events_stream.json
│       └── sample_catalog_seed.json
└── README.md
```

**Branching:** `main` stays demoable at all times. Each person works on their own long-lived branch (`fe/main`, `be/main`) and merges to `main` at each daily checkpoint (§14), not continuously. Since folders don't overlap, merges are close to conflict-free.

---

## 4. Environment & config

| Variable | Used by | Value (local dev) | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | extension | `http://localhost:8000` | Person 1 points the API client here |
| `VITE_API_BASE_URL` (prod) | extension | `https://shelfie-api.onrender.com` (placeholder — Person 2 fills in real URL Day 3) | Swapped in before packaging the demo `.crx` |
| `DATABASE_URL` | backend | `postgresql://shelfie:shelfie@localhost:5432/shelfie` | Docker Compose sets this automatically |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | backend (fuzzy compiler) | set in `backend/.env`, never committed | Compiler must run with this **unset** too — see fallback in §9's `/compile` entry |
| `CORS_ORIGINS` | backend | `chrome-extension://*` (dev), tightened later if needed | Extension origin looks like `chrome-extension://<id>`; allow `*` for the hackathon, don't overthink it |
| `PORT` | backend | `8000` | |

Local dev ports: Postgres `5432`, FastAPI `8000`, Vite dev server for the panel `5173` (only used for hot-reload iteration on panel UI outside the extension shell; the actual extension loads the built panel, not the Vite dev server, when tested unpacked in Chrome).

Both `.env.example` files live in the repo (with dummy values) so a fresh clone tells you exactly what to fill in.

---

## 5. Canonical taxonomy

**This is the list that the adapter (Person 1), the catalog seed (Person 2), and the fuzzy compiler's validator (Person 2) must all agree on character-for-character.** If you add a value, add it here first, in the same message tell the other person.

Kept intentionally small — enough to cover the demo story (kurtas → shoes vertical jump, Libas → Aurelia refinement) without needing a real Myntra taxonomy dump.

```yaml
articleType:
  ethnic_wear:   [kurta, kurti, saree, lehenga]
  western_wear:  [t_shirt, shirt, jeans, trousers, dress, jacket]
  footwear:      [running_shoes, sneakers, sandals, formal_shoes]
# "taxonomy vertical" (§ drift engine) = the top-level key: ethnic_wear / western_wear / footwear
# crossing a vertical (kurta -> running_shoes) is the dominant "new intent" signal

gender: [men, women, unisex, boys, girls]

brand:
  # enough spread across articleTypes to make Discover/coverage demos look real
  [Libas, Aurelia, Biba, W, Fabindia, Global Desi,      # ethnic
   H&M, Levis, Roadster, Zara,                          # western
   Nike, Adidas, Puma, Bata, Woodland, Skechers]         # footwear

fabric: [pure_cotton, cotton_blend, linen, polyester, silk, denim, leather, synthetic, rayon]

sleeve: [sleeveless, short, three_quarter, full]     # apparel only; omit for footwear

size:
  apparel: [XS, S, M, L, XL, XXL]
  footwear: ["6","7","8","9","10","11"]

color:
  [black, white, navy, maroon, beige, grey, red, blue, green, yellow,
   pastel, earthy, neon, sequins, metallic]
  # note: "neon", "sequins", "metallic" are treated as color/finish tags, not literal hues —
  # this matches the fuzzy-compiler lexicon's "flashy -> exclude neon/sequins/metallic"

occasion: [workwear, casual, festive, wedding, sports, formal]

price: { min: 0, max: 10000 }        # INR, integer, any sub-range legal
rating: { min: 0.0, max: 5.0 }       # float, 0.5 steps
```

Person 2: the seed script (§ Person 2 doc) must generate products whose attributes are drawn **only** from this list. Person 1: the adapter's URL→constraints mapping must emit values from this list (§12).

---

## 6. Canonical constraint schema

The `constraints` object appears inside `ProfileVersion` (§7), inside drift computation, inside the fuzzy compiler's output, and inside coverage queries. One shape, everywhere.

**TypeScript (extension side — `extension/src/api/types.ts`):**
```ts
export interface Constraints {
  category: { articleType: string; gender?: string };
  price:    { min: number; max: number };
  brand:    { include: string[]; exclude: string[] };
  fabric:   { include: string[] };
  sleeve?:  { include: string[] };          // omit for footwear
  size:     { include: string[] };
  color:    { include: string[]; exclude: string[] };
  rating?:  { min: number };
  occasion?: string;
}
```

**Pydantic (backend side — `backend/app/models/constraints.py`):**
```python
from pydantic import BaseModel, Field

class CategoryConstraint(BaseModel):
    articleType: str
    gender: str | None = None

class RangeConstraint(BaseModel):
    min: float
    max: float

class SetConstraint(BaseModel):
    include: list[str] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)

class Constraints(BaseModel):
    category: CategoryConstraint
    price: RangeConstraint
    brand: SetConstraint
    fabric: SetConstraint
    sleeve: SetConstraint | None = None
    size: SetConstraint
    color: SetConstraint
    rating: dict | None = None      # {"min": 4.0}
    occasion: str | None = None
```

**Rule:** every field name matches exactly between the two. If Person 2 adds a field to the Pydantic model, it does not exist to the frontend until it's added here **and** to the TS interface **and** the adapter emits it.

---

## 7. `ProfileVersion` — the full object

This is what the backend returns from `GET /profiles/{id}` and what a deck card in Discover is built from.

```jsonc
{
  "profileId": "prof_8f2a91",
  "version": 3,
  "name": "School Wear",
  "description": "Cotton workwear kurtas, nothing flashy",
  "owner": "user_amma",
  "visibility": "private",              // "private" | "public"
  "forkedFrom": null,                   // or { "profileId": "...", "version": 2, "owner": "..." }
  "stars": 0,
  "forkCount": 0,
  "createdAt": "2026-07-21T10:14:00Z",
  "updatedAt": "2026-07-22T09:02:00Z",
  "createdBy": "user",                  // "user" | "ai"
  "query": "kurta",
  "constraints": { /* §6 shape */ },
  "softIntent": {                       // present only if NL/fuzzy input was used; else null
    "raw": "nothing flashy, for school as a teacher",
    "compiledTo": ["color.exclude += [neon, sequins]", "occasion = workwear"]
  }
}
```

---

## 8. Event log schema & event type catalog

Person 2 owns the table; Person 1 never talks to it directly (always goes through the API), but must know the event **types** because the API surfaces them in the timeline endpoint (§9).

```sql
CREATE TABLE events (
  event_id   TEXT PRIMARY KEY,          -- ev_xxxxxxxx
  profile_id TEXT NOT NULL,
  seq        INT  NOT NULL,             -- monotonic per profile_id, starts at 1
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  actor      TEXT NOT NULL,             -- "user" | "ai"
  actor_id   TEXT NOT NULL,             -- user_xxxx
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, seq)
);
```

Event type catalog (payload shapes are exact — these are what `GET /profiles/{id}/timeline` returns per row):

| type | payload | meaning |
|---|---|---|
| `ProfileCreated` | `{ name, query, constraints, visibility }` | seq 1 of every profile |
| `VersionCommitted` | `{ version: number }` | marks "this is a saved snapshot" |
| `FilterChanged` | `{ path: string, value: any }` e.g. `{ "path": "brand.include", "value": ["Aurelia"] }` | one field edit, applied before the next commit |
| `RolledBack` | `{ toVersion: number }` | history preserved; state after this event = state at `toVersion` |
| `ForkedFrom` | `{ srcProfileId, srcVersion, srcOwner }` | always `seq: 1` of a forked profile's own stream |
| `VisibilityChanged` | `{ visibility: "public" | "private" }` | L1 publish/unpublish |
| `Starred` / `Unstarred` | `{ byUser: string }` | logged on the *deck's* stream for audit; the fast counter lives in the `decks` projection |

---

## 9. REST API contract

Base URL: `VITE_API_BASE_URL` (§4). All bodies are JSON. All endpoints require the `X-User-Id` header (§11).

| Method | Path | Purpose | Request body | Success response |
|---|---|---|---|---|
| `POST` | `/profiles` | Create profile (Save as New Profile) | `{ name, query, constraints, softIntent?, visibility? }` | `201` → `ProfileVersion` |
| `GET` | `/profiles` | List current user's profiles (optionally by persona) | query param `?persona=user_divya` | `200` → `ProfileVersion[]` (latest version each) |
| `GET` | `/profiles/{id}` | Get one profile at latest version | — | `200` → `ProfileVersion` |
| `GET` | `/profiles/{id}?version=1` | Get one profile at a specific past version | — | `200` → `ProfileVersion` (state folded up to that version) |
| `POST` | `/profiles/{id}/commit` | Save current working set as new/updated version | `{ mode: "new_version" \| "update" \| "new_profile", constraints, query, name? }` | `200` → `ProfileVersion` (new version) |
| `POST` | `/profiles/{id}/rollback` | Restore an earlier version | `{ toVersion: number }` | `200` → `ProfileVersion` (post-rollback state) |
| `GET` | `/profiles/{id}/timeline` | Full version history for the UI (§16 in master doc) | — | `200` → `{ versions: [{version, summary, createdAt}], events: [...] }` |
| `POST` | `/drift` | Compute drift between active profile and live working set | `{ profileId, liveConstraints }` | `200` → `{ distance: number, decision: "update" \| "new_version" \| "new_profile", reason: string, fieldContributions: {field: number}[] }` |
| `POST` | `/compile` | Fuzzy NL → validated constraint edits | `{ text: string, baseConstraints?: Constraints }` | `200` → `{ compiledTo: string[], appliedConstraints: Constraints, droppedProposals: string[] }` |
| `POST` | `/coverage` | Count matches + suggest what to relax | `{ constraints: Constraints }` | `200` → `{ count: number, suggestions: [{ field: string, ifRemoved: number, gain: number }] }` |
| `POST` | `/diff` | Dry-run diff between two constraint sets | `{ before: Constraints, after: Constraints }` | `200` → `{ added: number, removed: number, total: number, addedSampleBrands: string[] }` |
| `POST` | `/profiles/{id}/publish` | Toggle visibility | `{ visibility: "public" \| "private" }` | `200` → `ProfileVersion` |
| `GET` | `/decks` | Discover feed | query params `?sort=stars\|recent&occasion=&maxPrice=` | `200` → `ProfileVersion[]` (public only) |
| `POST` | `/decks/{id}/star` | Star / unstar (toggle) | `{ action: "star" \| "unstar" }` | `200` → `{ stars: number, starredByMe: boolean }` |
| `POST` | `/decks/{id}/fork` | Fork a public deck into caller's account | `{}` | `201` → `ProfileVersion` (new profile, `forkedFrom` set) |
| `POST` | `/behaviour/suggest` | Client reports a completed search; server returns a suggestion if the repetition threshold is crossed | `{ constraints: Constraints }` | `200` → `{ suggest: boolean, reason?: string }` |
| `GET` | `/personas` | List personas on the account | — | `200` → `[{ id, label, emoji }]` |
| `GET` | `/health` | Liveness check for demo-day sanity | — | `200` → `{ status: "ok" }` |

Full request/response JSON examples for every route above live in `shared/fixtures/` (§13) — copy-paste-able for both sides' tests.

---

## 10. Error format & status codes

Every non-2xx response body:
```json
{ "error": { "code": "PROFILE_NOT_FOUND", "message": "No profile with id prof_xxxx for this user" } }
```

| Status | When |
|---|---|
| `400` | Malformed body / constraint value outside taxonomy (§5) |
| `401` | Missing `X-User-Id` header |
| `404` | Profile/deck id not found, or not owned/visible to caller |
| `409` | `commit` with `mode: "update"` on a version that's since changed (rare in a hackathon demo; handle simply — last write wins is fine) |
| `500` | Unhandled server error — log it, still return this shape |

Person 1: every API client function must handle the `error.code` shape, not assume a raw string — the UI's error toasts read `error.message`.

---

## 11. Auth / user identification

No real auth for the hackathon. Every request from the extension carries:
```
X-User-Id: user_amma
```
The extension side panel has a **hardcoded 3-persona account** (`user_amma` acting as 3 personas: `persona_amma`, `persona_divya`, `persona_arjun` — see persona vs. user distinction below) picked from a dropdown at first load — no login screen, no password. This is explicitly scoped as a fallback per §17 of the design doc.

**Persona vs. user, precisely** (this trips people up): `owner` on a `ProfileVersion` is the **account-level** `X-User-Id`. `persona` is a lighter tag stored alongside — add a `persona` query param / field where profiles are listed/created so the switcher (§9's `GET /personas`, `GET /profiles?persona=`) can filter without needing separate logins per family member. Keep personas as a **hardcoded array of 3** returned by `/personas` — no persona CRUD needed for the demo.

---

## 12. The Myntra URL contract

**This is the single highest-risk unknown in the project. Person 1 verifies this tonight (Day 0), before writing any other extension code**, per the design doc §8.3 / §3 risk #2.

### 12.1 What to do tonight
1. Open real Myntra.com in a browser.
2. Search `kurta`, apply filters one at a time (brand, price, fabric, sleeve, size, colour, sort), watching the URL bar after each.
3. Record the **actual** param format Myntra uses (likely something like `?f=brand:Libas&price=0-1500` or an encoded facet blob — could go either way, must be observed, not guessed).
4. Update this section with the **real** mapping. Anything found to be DOM-only (not in the URL) gets listed under §12.3 and handled as a documented special case in the adapter.

### 12.2 Placeholder mapping (replace after step 1–4 above)
Until verified, build and test the adapter against this **placeholder** scheme so nobody is blocked tonight:
```
myntra.com/{articleType}?gender={gender}&brand={csv}&price={min}-{max}
  &fabric={csv}&sleeve={csv}&size={csv}&color={csv}&rating={min}&sort={field}
```
Example:
```
myntra.com/kurta?gender=women&brand=Libas&price=0-1500&fabric=pure_cotton&sleeve=three_quarter&size=XL&color=pastel,earthy&rating=4.0
```
The adapter's read function parses this into a `Constraints` object (§6); the write function does the reverse to reconstruct a navigable URL.

### 12.3 DOM-only fallback fields
List anything Myntra doesn't put in the URL here once discovered (e.g., if "sort" turns out to be a POST body). The adapter reads these from the DOM as an isolated, clearly-labeled special case — never mixed into the URL-parsing code path.

*(Empty until Day 0 verification — fill in tonight.)*

### 12.4 Why this section matters to Person 2 too
Person 2's catalog seed and coverage/drift math work entirely in the `Constraints` shape (§6) and never touch Myntra's URL directly — so Person 2 is unaffected by *how* Myntra encodes things, only by whether the resulting `Constraints` object uses values from the taxonomy in §5. Read this section once for context; you don't need to revisit it.

---

## 13. Working independently: mocking the other side

Neither of you should sit idle waiting for the other's server/UI to exist.

**Person 1, before Person 2's API is up:**
- Point `VITE_API_BASE_URL` at a tiny mock server, or use [MSW](https://mswjs.io/) intercepting `fetch` in the extension, seeded from `shared/fixtures/*.json`.
- Every fixture file matches the exact response shape in §9 — build the whole UI against these before a single real endpoint exists.
- Minimum fixtures needed Day 0 night: `sample_profile_version.json`, a `GET /profiles` list response, a `GET /decks` list response, a `/drift` response for the Libas→Aurelia example.

**Person 2, before Person 1's extension is up:**
- Test every endpoint with `curl` or the FastAPI auto-generated Swagger UI at `http://localhost:8000/docs` — you never need the extension running to build and verify the backend.
- Use the same `shared/fixtures/*.json` as request bodies so your Day 1 integration isn't the first time your endpoint sees "real" shaped data.

**Both:** update `shared/fixtures/` whenever you touch a shape in §6–§9, so the fixtures never go stale. Treat stale fixtures as a bug, same severity as a broken endpoint.

---

## 14. Daily integration checkpoints

Short, scheduled syncs — not open-ended. Bring your laptop, actually run the other person's thing.

| When | What to verify together |
|---|---|
| **Day 0, before bed** | This contract is read by both. §5 taxonomy locked. §12 Myntra URL findings written up by Person 1. `docker-compose up` works for Person 2; `npm run dev` + unpacked-load works for Person 1. |
| **Day 1, evening** | **Must-have EOD1 (design doc §17):** on real Myntra, Person 1's extension calls Person 2's real (not mocked) `POST /profiles`, `GET /profiles/{id}`, reload works end-to-end. If the real API isn't ready, Person 1 stays on mocks and this checkpoint slips to Day 2 morning — flag it immediately, don't let it slip silently. |
| **Day 2, evening** | **Must-have EOD2:** 3-way save modal calls real `/drift`; commit/rollback hit real `/profiles/{id}/commit` and `/rollback`; timeline UI renders real `/profiles/{id}/timeline`. |
| **Day 3, midday** | Discover feed, star, fork wired to real endpoints; behavioural toggle wired; fuzzy compiler input wired (or gracefully hidden if LLM is shaky, per design doc's fallback). |
| **Day 3, ~4–5 hours before submission** | **Hard integration freeze.** Everything after this is polish only — no new endpoints, no new fields. Record the demo video against the frozen build. |

---

## 15. Git workflow

- `main` = always demoable.
- `fe/main` (Person 1) and `be/main` (Person 2) = daily working branches.
- Merge to `main` at each checkpoint in §14, after a quick smoke test together.
- Because `extension/` and `backend/` never overlap, conflicts should only ever happen in `docs/` or `shared/fixtures/` — resolve those live, together, don't leave it for later.
- Commit messages: plain, present-tense (`add drift endpoint`, `wire 3-way save modal to /drift`) — no need for conventional-commit ceremony in a 3-day hackathon.

---

## 16. Changing this contract

1. Edit this file.
2. Update the matching TS interface / Pydantic model / fixture in the same sitting.
3. Say it out loud / message it — one line: *"changed `/coverage` response to add `suggestions[].gain` — pull latest contract."*
4. Never let a contract change live only in one person's head or one person's code.

---

## 17. Definition of done, per day, both sides

| Day | Person 1 done means | Person 2 done means |
|---|---|---|
| 0 | Extension loads unpacked on myntra.com, shows a static side panel; real URL scheme documented in §12 | `docker-compose up` gives a running Postgres + FastAPI; `events` table + `ProfileVersion` schema match §6/§7 exactly; `/health` returns 200 |
| 1 | Save-as-Profile + Reload work on live Myntra against the **real** API | `/profiles` POST/GET, fold/projection working; a profile round-trips through Postgres correctly |
| 2 | Dirty-state badge, 3-way save modal, timeline + rollback UI all wired to real endpoints | `/commit`, `/rollback`, `/drift`, `/timeline` all correct against the worked examples in the design doc §9.5 |
| 3 | Discover feed, star, fork, persona switcher, behavioural toggle, polish pass done | `/decks`, `/star`, `/fork` (real event-log replay), `/coverage`, `/compile` (or lexicon fallback) all live and deployed to a public URL |

---

## 18. Escalation

If something in this contract is ambiguous or wrong at 2am and the other person is asleep: **make the smallest reasonable decision, write it into this file with a one-line note of what you assumed, and flag it at the next checkpoint.** Don't block on a synchronous answer — the whole point of this document is that you shouldn't need one.
