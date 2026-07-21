# Shelfie — Person 2 Implementation Doc
### Backend + AI — everything that runs on the server

**This is your build doc.** It's meant to be complete enough that you can work for three days mostly without needing to ask the frontend person anything, except at the scheduled checkpoints. Whenever this doc says "per the contract," it means [Shelfie_Shared_Contract.md](Shelfie_Shared_Contract.md) — that file's field names, endpoint shapes, and taxonomy values are binding; this doc tells you *how to build against them*, not what they are.

For the full product rationale (why event sourcing, why drift, why fork-not-merge, and how to defend all of it in jury Q&A), read [Shelfie_Design_Doc_v2.md](Shelfie_Design_Doc_v2.md) §5, §9–§12, §19 once before you start. For plain-language walkthroughs of the same mechanics (useful for explaining your own code to Person 1 or a judge), [Shelfie_Architecture_Explained.md](Shelfie_Architecture_Explained.md) Parts 5–9 and 12 cover exactly this.

Calendar: today is **2026-07-21**. Day 0 = tonight, Day 1 = Tue 2026-07-22, Day 2 = Wed 2026-07-23, Day 3 = Thu 2026-07-24 (**submit 1:00 PM IST**).

---

## Table of contents

1. [Your scope, precisely](#1-your-scope-precisely)
2. [Tech stack](#2-tech-stack)
3. [Repo folder structure](#3-repo-folder-structure)
4. [Day-by-day task list](#4-day-by-day-task-list)
5. [Database schema — full DDL](#5-database-schema--full-ddl)
6. [Event sourcing engine — implementation](#6-event-sourcing-engine--implementation)
7. [Endpoint-by-endpoint implementation guide](#7-endpoint-by-endpoint-implementation-guide)
8. [Drift engine — implementation](#8-drift-engine--implementation)
9. [Fuzzy compiler — implementation](#9-fuzzy-compiler--implementation)
10. [Coverage advisor — implementation](#10-coverage-advisor--implementation)
11. [Fork engine — implementation](#11-fork-engine--implementation)
12. [Catalog seed script](#12-catalog-seed-script)
13. [Docker Compose & Dockerfile](#13-docker-compose--dockerfile)
14. [Deployment (Render/Railway)](#14-deployment-renderrailway)
15. [Testing checklist](#15-testing-checklist)
16. [Working before the frontend is ready](#16-working-before-the-frontend-is-ready)
17. [Demo-day checklist](#17-demo-day-checklist)
18. [Definition of done, per day](#18-definition-of-done-per-day)

---

## 1. Your scope, precisely

You own **everything server-side**:
- FastAPI app and every route in [the contract §9](Shelfie_Shared_Contract.md#9-rest-api-contract)
- PostgreSQL: schema, migrations, the event store, the read-model projection, social tables, catalog
- The event sourcing engine (append, fold, replay, rollback-as-append, fork-as-replay)
- The **drift engine** (weighted structural distance)
- The **fuzzy-intent compiler** (LLM extraction + deterministic taxonomy validator)
- The **coverage/conflict advisor**
- The **catalog seed data** — must conform exactly to the taxonomy in contract §5
- Deployment: Docker Compose locally, a public URL by Day 3

You do **not** own: anything that runs in the browser, the adapter, or any React/UI code. You *serve* JSON; you never render UI.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| API | **FastAPI (Python)** | Fast to write REST in, auto-generated Swagger docs at `/docs` — invaluable for testing without the extension |
| Event store + read model + social + catalog | **PostgreSQL** | One boring, reliable DB; append-only `events` table is the write model, `profile_versions` is the read-model projection — real CQRS without extra infra |
| Drift + behavioural engine | **Plain Python module**, deterministic | No model training — explainability is the selling point, not a limitation (design doc §13.2, §19) |
| Fuzzy compiler | **LLM API call (extract) + local taxonomy validator (approve)** | The defensible part is the validator, not the API call |
| Deploy | **Docker Compose** locally; **Render or Railway** for a public demo URL | One-command bring-up de-risks the finale |

---

## 3. Repo folder structure

```
backend/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example                  # DATABASE_URL, OPENAI_API_KEY/ANTHROPIC_API_KEY, CORS_ORIGINS
└── app/
    ├── main.py                    # app factory, CORS, router registration, /health
    ├── config.py                  # env var loading
    ├── db/
    │   ├── schema.sql              # §5, applied on first container boot
    │   └── session.py              # connection pool / session dependency
    ├── models/
    │   ├── constraints.py          # Pydantic — mirrors contract §6 exactly
    │   └── profile.py              # Pydantic — mirrors contract §7 exactly
    ├── events/
    │   ├── store.py                 # append_event(), load_events()
    │   ├── project.py               # apply(), project(), state_at_version(), rollback fold
    │   └── types.py                 # event type catalog constants (contract §8)
    ├── routes/
    │   ├── profiles.py
    │   ├── drift.py
    │   ├── compile.py
    │   ├── coverage.py
    │   ├── diff.py
    │   ├── decks.py
    │   ├── behaviour.py
    │   └── personas.py
    ├── drift/
    │   └── engine.py                # compute_drift() — §8 below
    ├── compiler/
    │   ├── extract.py               # LLM call
    │   ├── validate.py              # taxonomy bouncer
    │   └── lexicon.py               # fallback dictionary, also used as few-shot seed
    ├── coverage/
    │   └── advisor.py
    └── seed/
        └── generate_catalog.py      # one-off script
```

---

## 4. Day-by-day task list

| Day | Your tasks | Must-have by end of day |
|---|---|---|
| **Day 0** (tonight) | `docker-compose up` bringing Postgres + FastAPI; apply `schema.sql`; `/health` returns 200. Lock the canonical taxonomy (contract §5) in `models/constraints.py`. Seed script skeleton. Agree `shared/fixtures/*.json` shapes with Person 1. | Fresh clone → `docker-compose up` → `/docs` loads, `/health` returns `{"status":"ok"}`. |
| **Day 1** | `events` table + `apply`/`project` (§6). `POST /profiles`, `GET /profiles`, `GET /profiles/{id}`. Seed ~5-20k catalog products (§12). | A profile round-trips correctly through Postgres: create → fetch → matches what was sent. EOD1 checkpoint with Person 1 (real API, not mocks). |
| **Day 2** | `VersionCommitted`/`RolledBack` events, `/commit`, `/rollback`, `/timeline`. **Drift engine** (§8) + `/drift`. | The 4 worked drift examples (design doc §9.5) produce the exact expected decisions. Rollback-then-edit doesn't corrupt history (dedicated test). |
| **Day 3** | `/decks`, `/star`, `/fork` (real replay, §11). `/coverage` (§10). `/compile` (§9) — lexicon fallback working even without an LLM key set. Deploy to Render/Railway. | Full API deployed at a public URL; Swagger docs reachable; Person 1's build points at it and everything works end-to-end. |

---

## 5. Database schema — full DDL

This is the canonical DDL (identical to master doc §5 — copy it verbatim into `db/schema.sql`, this is not a place to improvise a "better" schema mid-build):

```sql
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

CREATE TABLE profile_versions (
  profile_id   TEXT NOT NULL,
  version      INT  NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  owner        TEXT NOT NULL,
  persona      TEXT,
  visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  forked_from  JSONB,
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

CREATE TABLE decks (
  profile_id  TEXT PRIMARY KEY,
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

CREATE TABLE personas (
  id     TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label  TEXT NOT NULL,
  emoji  TEXT NOT NULL
);
-- seed the 3 demo personas directly here, e.g.:
INSERT INTO personas VALUES
  ('persona_amma','user_amma','Amma','👩'),
  ('persona_divya','user_amma','Divya','👧'),
  ('persona_arjun','user_amma','Arjun','👦');
```

---

## 6. Event sourcing engine — implementation

Full rationale: design doc §15, architecture-explained Part 6. This is the code, precisely.

```python
# app/events/project.py
EMPTY_STATE = {"name": None, "query": None, "constraints": None, "visibility": "private", "version": 0}

def apply(state: dict, event) -> dict:
    if event.type == "ProfileCreated":
        return {**EMPTY_STATE, **event.payload, "version": 0}
    if event.type == "FilterChanged":
        return set_path(state, event.payload["path"], event.payload["value"])
    if event.type == "VersionCommitted":
        return {**state, "version": event.payload["version"]}
    if event.type == "ForkedFrom":
        return state   # provenance only; the ProfileCreated event that follows carries the actual state
    return state

def prefix_up_to_commit(events: list, version: int) -> list:
    out = []
    for e in events:
        out.append(e)
        if e.type == "VersionCommitted" and e.payload["version"] == version:
            break
    return out

def project(events: list) -> dict:
    """Fold with rollback support. See note below — this is the one piece to test hardest."""
    events = sorted(events, key=lambda e: e.seq)
    state = EMPTY_STATE
    i = 0
    while i < len(events):
        e = events[i]
        if e.type == "RolledBack":
            prefix = prefix_up_to_commit(events[:i], e.payload["toVersion"])
            state = project(prefix)
        else:
            state = apply(state, e)
        i += 1
    return state

def state_at_version(events: list, v: int) -> dict:
    return project(prefix_up_to_commit(events, v))
```

**Why this needs a dedicated test (do this Day 2, don't skip it):** a naive implementation that just "re-folds everything including the RolledBack marker" tends to silently forget the rollback the moment a *new* edit is appended afterward. Test case: create v1, edit, commit v2, rollback to v1, make a *new* edit, commit as v2-again → assert the final state does **not** contain the original v2's edit. This exact sequence is also in the demo (design doc §18 step 3), so a bug here is a bug the judges will see live.

```python
# app/events/store.py
def append_event(profile_id: str, type_: str, payload: dict, actor: str, actor_id: str, db) -> Event:
    seq = next_seq(profile_id, db)
    event = Event(event_id=gen_id("ev"), profile_id=profile_id, seq=seq,
                  type=type_, payload=payload, actor=actor, actor_id=actor_id)
    db.execute(INSERT_EVENT_SQL, event.dict())
    return event

def load_events(profile_id: str, db) -> list[Event]:
    rows = db.execute(SELECT_EVENTS_SQL, {"profile_id": profile_id})
    return [Event(**r) for r in rows]
```

After every write, upsert `profile_versions` (mark prior `is_latest=false`, insert new row `is_latest=true`) inside the same DB transaction as the event append — keep it simple, a single `BEGIN … COMMIT` around both operations is enough for hackathon scale.

---

## 7. Endpoint-by-endpoint implementation guide

Full request/response shapes are canonical in [contract §9](Shelfie_Shared_Contract.md#9-rest-api-contract) — this section is *how*, not *what*.

| Endpoint | Implementation notes |
|---|---|
| `POST /profiles` | Validate `constraints` against the taxonomy (reject with `400` + `INVALID_CONSTRAINT` if a value isn't in contract §5). `gen_id("prof")`. Write `ProfileCreated` (seq 1) + `VersionCommitted` (seq 2, version 1). Upsert projection. Return the `ProfileVersion`. |
| `GET /profiles` | `SELECT * FROM profile_versions WHERE owner=:user AND is_latest AND (persona=:persona OR :persona IS NULL)`. |
| `GET /profiles/{id}` | If `?version=` given, call `state_at_version`; else read the `is_latest` row directly (faster than folding every time — this is exactly what the projection is for). |
| `POST /profiles/{id}/commit` | Branches on `mode`: `new_version`/`update` write `FilterChanged` events (one per changed field, or a single batched event — batched is simpler and fine) + `VersionCommitted` with `version = prev+1` (`new_version`) or the same version number overwritten in the projection only, no new event (`update` — see note below). `new_profile` calls the same logic as `POST /profiles` but seeded from the current working set. |
| `POST /profiles/{id}/rollback` | Write a single `RolledBack` event. Re-fold, upsert projection. |
| `GET /profiles/{id}/timeline` | Load all events, and for each `VersionCommitted` seq, compute `state_at_version` to build a `{version, summary, createdAt}` row. `summary` = a short string built from `constraints` (e.g. `"Aurelia · ₹1500 · cotton"` — pick 3-4 most identity-defining fields). |
| `POST /drift` | Load the active profile's constraints, call `compute_drift` (§8) against the posted `liveConstraints`. |
| `POST /compile` | See §9. |
| `POST /coverage` | See §10. |
| `POST /diff` | `SELECT COUNT(*)` under `before` minus under `after`, plus a sample of newly-matching brands (`SELECT DISTINCT brand ... LIMIT 5`) for the `addedSampleBrands` field. |
| `POST /profiles/{id}/publish` | Update `visibility` on the projection row (and log a `VisibilityChanged` event for audit-completeness — not strictly required to make the demo work, but cheap and matches the design doc's event catalog). Insert into `decks` if newly public. |
| `GET /decks` | `SELECT * FROM profile_versions JOIN decks USING(profile_id) WHERE visibility='public' ORDER BY stars DESC` (or `updated_at DESC` for `sort=recent`). |
| `POST /decks/{id}/star` | Toggle row in `stars`; update `decks.stars` counter; return the new count + whether the caller has starred it. |
| `POST /decks/{id}/fork` | See §11. |
| `POST /behaviour/suggest` | See design doc §11 — cluster the user's recent posted `liveConstraints` snapshots (keep the last ~10 in a small in-memory or DB-backed ring buffer per user) by drift distance from each other; if 3+ within a tight window fall under `TAU_LOW`, return `suggest: true`. This reuses `compute_drift` — no separate model. |
| `GET /personas` | `SELECT * FROM personas WHERE user_id=:user`. |
| `GET /health` | Trivial `{"status": "ok"}`, no DB round-trip needed unless you want to confirm connectivity too (fine either way). |

**Note on `update` mode:** "update this version in place" is semantically a mutation of history, which event sourcing normally forbids. The pragmatic hackathon interpretation (and it's fine to say this explicitly if asked): write the edit as a `FilterChanged` event same as `new_version`, but do **not** write a new `VersionCommitted` — instead just re-point `profile_versions`'s existing latest row's `constraints` to the new folded state. This keeps the diary honest (the edit is still logged) while giving the user the "just fix this version" UX they asked for.

---

## 8. Drift engine — implementation

Full algorithm, weights, and the 4 worked test cases are canonical in [master doc §8](Shelfie_Implementation_Master.md#8-drift-engine--full-algorithm) — copy that code into `app/drift/engine.py` directly, it's already complete and ready to paste. Read the design doc §9 once for *why* the weights are ordered this way (category dominates because crossing a taxonomy vertical is the strongest new-intent signal) — you'll want that explanation ready for jury Q&A regardless of who's presenting.

**Test this first, before wiring `/drift`** — run the 4 worked examples as a standalone script or pytest before building the endpoint around it. A bug here is visible in the literal headline moment of the demo (the 3-way save modal's recommendation).

---

## 9. Fuzzy compiler — implementation

Full pipeline (extract → validate → apply) and the lexicon table are canonical in [master doc §9](Shelfie_Implementation_Master.md#9-fuzzy-intent-compiler--full-pipeline) — implement `compiler/extract.py`, `compiler/validate.py`, `compiler/lexicon.py` exactly as specified there.

**Extra implementation notes:**
- `extract.py`'s LLM call should request **structured/JSON output** (whichever your chosen provider's API calls this — e.g. a JSON-mode or tool-call response) so you're not regex-parsing free text out of a chat completion. If your LLM library supports it, define the triple list as a schema/tool the model must call.
- **Always run `validate.py`, even when the LLM is confident.** No exceptions — this is the entire "can't hallucinate a filter" guarantee (design doc §10, and the answer to the sharpest jury question in §19). Never apply an unvalidated triple, ever, under any code path.
- **`LLM down` handling:** wrap the `extract.py` call in a try/except with a short timeout (2-3s is plenty for a demo); on failure or missing API key, skip straight to lexicon-only matching (`lexicon.py`) against the raw text. The `/compile` endpoint should return `200` either way — the response's `compiledTo` list is just shorter when running lexicon-only. Never return a `5xx` for "the LLM happened to be unavailable"; that's an expected, handled case, not a server error.
- Build and ship the **lexicon-only path first** (Day 3 morning), get the LLM extraction working as an enhancement on top only if time allows — per the master doc's Day 3 fallback ordering, this is explicitly the "ship this even if the LLM integration slips" piece.

---

## 10. Coverage advisor — implementation

Full algorithm is canonical in [master doc §10](Shelfie_Implementation_Master.md#10-coverage--conflict-advisor--full-algorithm). Implementation notes:

- `RELAXABLE_FIELDS` for the demo: `brand`, `fabric`, `sleeve`, `color`, `size` (drop the include-list entirely), plus `price` (widen `max` by, say, 50%) and `rating` (lower `min` by 0.5). Category is deliberately **not** relaxable here — relaxing category isn't "loosening a filter," it's changing the goal, which is the drift engine's territory, not the coverage advisor's.
- Build the WHERE-clause construction as one small shared helper (`build_where(constraints) -> (sql, params)`) — both `/coverage` and `/diff` need it, don't duplicate the logic.
- Tune your seeded catalog's density (§12) so this is actually demoable: too sparse and *everything* triggers the low-count warning (including a totally normal search); too dense and nothing ever does. Aim for the coverage banner to fire specifically on the design doc's worked example (pure cotton + hand-embroidered + under ₹800 → ~6 matches) and stay quiet on normal searches.

---

## 11. Fork engine — implementation

Full mechanics are canonical in [master doc §11](Shelfie_Implementation_Master.md#11-fork-engine--full-mechanics) — copy that function into `routes/decks.py`'s fork handler (or a `fork/engine.py` module if you prefer separating it, your call). Key points to not miss:
- The fork's own event stream starts completely fresh (`seq` 1, 2, 3…) under the **new** `profile_id` — never append to the source's stream.
- `forkedFrom` provenance is stored both as the `ForkedFrom` event payload *and* denormalized onto the `profile_versions.forked_from` column so `GET /profiles/{id}` doesn't need to walk the event log just to answer "what was this forked from" for the UI.
- New fork defaults to **private** — the forker explicitly re-publishes if they want it public too (don't auto-publish; that's a surprising default nobody asked for).
- Increment `decks.fork_count` on the **source** profile and insert into `forks` — both are what power the Discover feed's `⑃57 forks` display and the master doc §12.3 "business impact" demand-signal argument, so don't skip them even though the demo doesn't strictly require displaying fork counts everywhere.

---

## 12. Catalog seed script

```python
# app/seed/generate_catalog.py
import random
from app.models.constraints import TAXONOMY   # same canonical taxonomy as contract §5

VERTICAL_TYPES = {
    "ethnic_wear": ["kurta", "kurti", "saree", "lehenga"],
    "western_wear": ["t_shirt", "shirt", "jeans", "trousers", "dress", "jacket"],
    "footwear": ["running_shoes", "sneakers", "sandals", "formal_shoes"],
}

def generate(n=8000):
    products = []
    for i in range(n):
        vertical = random.choice(list(VERTICAL_TYPES))
        article_type = random.choice(VERTICAL_TYPES[vertical])
        products.append({
            "id": f"prod_{i:06d}",
            "article_type": article_type,
            "gender": random.choice(["men","women","unisex"]),
            "brand": random.choice(BRANDS_FOR[vertical]),
            "fabric": None if vertical == "footwear" else random.choice(FABRICS),
            "sleeve": None if vertical == "footwear" else random.choice(SLEEVES),
            "size": random.choice(SHOE_SIZES if vertical == "footwear" else APPAREL_SIZES),
            "color": random.choice(COLORS),
            "price": round(random.uniform(300, 5000), -1),
            "rating": round(random.uniform(3.0, 5.0), 1),
            "occasion": random.choice(OCCASIONS),
        })
    return products
```

**Important:** don't make this uniformly random across *everything* — bias it a little so the demo's specific worked examples (design doc §9.5, §16.4's "+240 Aurelia / −60 Libas" diff numbers) are plausible. A simple trick: seed a deliberately dense cluster of `kurta + Libas + pure_cotton + ₹0-1500` products (a few hundred) and a deliberately dense cluster of `kurta + Aurelia + pure_cotton + ₹0-1800` (overlapping but distinct), so the dry-run diff and drift examples land on numbers close to what's written in the pitch deck. Otherwise fully random generation is fine for everything else — this only matters for the handful of scripted demo beats.

Run once after `docker-compose up`: `python -m app.seed.generate_catalog`. Make it idempotent (`TRUNCATE products` first, or check row count) so re-running during development doesn't duplicate data.

---

## 13. Docker Compose & Dockerfile

```yaml
# backend/docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: shelfie
      POSTGRES_PASSWORD: shelfie
      POSTGRES_DB: shelfie
    ports: ["5432:5432"]
    volumes:
      - ./app/db/schema.sql:/docker-entrypoint-initdb.d/schema.sql
      - pgdata:/var/lib/postgresql/data
  api:
    build: .
    depends_on: [db]
    ports: ["8000:8000"]
    env_file: .env
    volumes:
      - ./app:/app/app          # live-reload during dev
volumes:
  pgdata:
```

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

---

## 14. Deployment (Render/Railway)

1. Push the `backend/` image (or connect the repo directly — both platforms support Docker-based deploys from a repo).
2. Provision a managed Postgres instance on the same platform; set `DATABASE_URL` to its connection string.
3. Run `schema.sql` against the hosted DB once (via the platform's console/shell, or a one-off migration step in your deploy pipeline).
4. Run the seed script once against the hosted DB.
5. Confirm `https://<your-app>.onrender.com/health` and `/docs` both work publicly.
6. Give Person 1 the real URL to swap into `VITE_API_BASE_URL` for the packaged demo build (contract §4).
7. **Fallback if hosting falls through near the deadline:** `docker-compose up` locally is a fully valid backup — judges can run it, or you demo from your own laptop. Say this proactively if asked; it reads as preparedness, not failure (master doc §22).

---

## 15. Testing checklist

- [ ] Drift: all 4 worked examples (§8) produce the exact documented decision
- [ ] Rollback-then-new-edit does not resurrect rolled-back state (§6's dedicated test)
- [ ] Fork produces a fully independent stream; mutating the fork never touches the source's projection
- [ ] Every route's happy path tested via `curl` or `/docs`, using `shared/fixtures/*.json` as request bodies
- [ ] Every route's 4xx path returns the `{error:{code,message}}` shape (contract §10)
- [ ] `/compile` works with **and** without an LLM key set (lexicon fallback path explicitly tested with the key unset)
- [ ] Coverage advisor's suggestions sorted by descending gain, and the design doc's worked example (~6 matches, cotton+embroidered+under-₹800) actually returns a low count against your seeded catalog
- [ ] Seed script is idempotent (safe to re-run)

---

## 16. Working before the frontend is ready

You never need the extension running to build or verify anything. Use `http://localhost:8000/docs` (FastAPI's auto Swagger UI) to call every endpoint by hand, or `curl`/Postman with the exact bodies from `shared/fixtures/*.json`. Coordinate fixture shapes with Person 1 on Day 0 so you're both testing against the same "sample data," per [contract §13](Shelfie_Shared_Contract.md#13-working-independently-mocking-the-other-side).

---

## 17. Demo-day checklist

- [ ] Deployed backend is the frozen Day-3 commit, not a work-in-progress branch
- [ ] `/health` and `/docs` both reachable at the public URL
- [ ] Seed data present and not accidentally wiped by a re-run
- [ ] `.env` on the hosted instance has a valid LLM key (or you've consciously decided to demo the lexicon-only compiler — either is fine, just decide on purpose)
- [ ] Ran the full manual test checklist (§15) against the **deployed** instance, not just local Docker

---

## 18. Definition of done, per day

See [Shelfie_Shared_Contract.md §17](Shelfie_Shared_Contract.md#17-definition-of-done-per-day-both-sides) — your column is "Person 2 done means." Treat it as binding, not aspirational.
