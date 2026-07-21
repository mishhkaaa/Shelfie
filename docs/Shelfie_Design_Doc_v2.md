# Shelfie — Version-Controlled Shopping Profiles for Bharat
### A browser extension that layers version-controlled, shareable shopping intents on top of the live Myntra site

**Myntra WeForShe Hackerramp 2026 · "Build What's Next — Myntra for Bharat" · Theme 1 (Bharat discovery) + touches Theme 3 (community/creator)**

> **One sentence:** Today a shopper stacks a dozen filters to reach the exact shelf they want, then loses all of it when they leave — Shelfie is a browser extension on Myntra.com that turns any finished search into a **named, version-controlled Shopping Profile** you can reload, refine, roll back, keep separate from others on a shared account, and even **publish, discover, star and fork** like a repo.

---

## What changed in v2 (read this first)

Three upgrades over v1, each with a design consequence:

1. **Delivery is now a browser extension on the live Myntra site**, not a standalone mobile app. This is an *integration-credibility* play: you demo the feature working on real Myntra.com, which answers "how would this actually ship?" before it's asked. It also unlocks a stronger desktop tech stack.
2. **An opt-in behavioural-suggestion toggle** — users can switch on/off whether Shelfie watches their repeated searches to *suggest* saving a profile. Off by default; suggests only; never auto-profiles.
3. **A collaboration layer — "GitHub for shopping intents"** — publish a profile as a public deck, discover others', star, and **fork** into your own account. Built as a single-direction slice (fork = copy someone's history into your space); true multi-user co-editing is explicitly benched as roadmap because it reintroduces distributed-merge problems the single-user model elegantly avoids.

The Bharat framing is **re-anchored from "mobile-first" to "shared-account, multi-persona"** — because a laptop extension isn't how Bharat shops on mobile, but shared accounts are device-agnostic and still the strongest hook.

---

## Table of contents

1. [The problem](#1-the-problem)
2. [Why this is a Bharat problem](#2-why-this-is-a-bharat-problem)
3. [Why a browser extension (the integration argument)](#3-why-a-browser-extension-the-integration-argument)
4. [The solution in plain language](#4-the-solution-in-plain-language)
5. [The core innovation and why it's defensible](#5-the-core-innovation-and-why-its-defensible)
6. [Full feature set (scoped into tiers)](#6-full-feature-set-scoped-into-tiers)
7. [The central data model](#7-the-central-data-model)
8. [Reading Myntra's state — the adapter layer](#8-reading-myntras-state--the-adapter-layer)
9. [The intent-drift algorithm](#9-the-intent-drift-algorithm)
10. [The fuzzy-intent compiler (AI enhancement)](#10-the-fuzzy-intent-compiler-ai-enhancement)
11. [The behavioural-suggestion engine (opt-in)](#11-the-behavioural-suggestion-engine-opt-in)
12. [The collaboration layer — fork, star, discover](#12-the-collaboration-layer--fork-star-discover)
13. [Technology stack — chosen for this project](#13-technology-stack--chosen-for-this-project)
14. [System architecture](#14-system-architecture)
15. [Event sourcing, concretely (now with forks)](#15-event-sourcing-concretely-now-with-forks)
16. [User interface & interaction design](#16-user-interface--interaction-design)
17. [The 3-day build plan with fallbacks](#17-the-3-day-build-plan-with-fallbacks)
18. [How to demo it in 3 minutes](#18-how-to-demo-it-in-3-minutes)
19. [Defending it in the jury Q&A](#19-defending-it-in-the-jury-qa)
20. [Roadmap (what we deliberately did not build)](#20-roadmap-what-we-deliberately-did-not-build)
21. [Glossary](#21-glossary)

---

## 1. The problem

Every fashion session has an invisible, discarded artifact: **the finished search.**

A user opens Myntra, types `cotton kurta`, then does real work — budget ₹1500, sleeve 3/4, size XL, brand Libas, fabric pure cotton, exclude loud colours, sort by rating. After 8–12 interactions they reach *exactly* the shelf they wanted: 30 products matching a real, specific need ("cotton kurtas for school, nothing flashy, my size and budget").

**Then they close the tab and 100% of that effort is deleted.**

Next week, same need, full rebuild from scratch. There is no saved representation of *the intent* — only the wishlist, which saves **destinations** (specific products, which go out of stock) and never the **route** (the reusable query+filter combination that found them).

This is a **state-persistence failure**, not an ML failure. The platform already computed exactly what the user wanted; it just throws it away on session end.

**Why "saved search" isn't the answer:** a frozen filter-set solves ~20% and a Myntra engineer will say so. Real intent isn't frozen — users switch Libas→Aurelia (new need or refinement?), bump budget for one occasion (overwrite forever?), or six months later shop running shoes (obviously not the same intent). A frozen filter-set has no answer to "I changed my mind but want the old one back." **The intent must be a living, version-controlled object that knows a refinement from a new goal.**

---

## 2. Why this is a Bharat problem

Maps to Theme 1, idea-starter 2 ("make the shelf feel personalised to each customer rather than just each city"). Re-anchored (v2) on shared accounts, not mobile:

**(a) Shared accounts are the Bharat default.** Myntra's own published engineering writing notes **~65% of accounts are used by multiple people** — one login for spouse, children, parents. Averaging their tastes "places the mean representation in a null space that fits nobody." A mother's *School Wear*, a daughter's *College Fusion*, a son's *Cricket Gear* are three intents fighting for one algorithmic profile, blended into mush. **Named, manually-saved profiles = one clean persona each; the user, not a black box, picks which is active.** This is device-agnostic — it holds on a shared laptop as much as a shared phone.

**(b) Deliberate, recurring purchases.** T2/T3 shopping skews to considered, repeat buys (workwear, school staples, festival wear). Recurring intent is exactly what benefits from a reloadable profile; the value compounds with repeat use — the Bharat pattern.

**(c) Discovery gap.** Bharat shoppers under-served by generic shelves benefit enormously from **community decks** (§12): a starrable, forkable *"Coimbatore Teacher Workwear — under ₹1500"* is a discovery surface tuned to a real segment Myntra's catalog doesn't surface well.

**Pitch line:** *"Metro personalization assumes one person, one taste, always fresh. Bharat is many people, one account, recurring needs. Shelfie is personalization built for how Bharat actually shops — explicit, reusable, separable, and shareable."*

---

## 3. Why a browser extension (the integration argument)

This is the strategic core of v2. A standalone app that *mimics* Myntra invites "so you built a fake Myntra — how would this ship?" **An extension that runs on the real, live site answers that before it's asked.**

- **It proves the integration path.** You demo the feature working against Myntra's *actual* DOM, filters, catalog, URL state. For a jury whose literal job is deciding what to integrate, *showing the integration is the win.* You stop being "a team with an idea" and become "a team that shipped a working overlay on your site."
- **It's honestly shippable two ways.** Ship as an extension for power users *today*; or Myntra lifts the exact same pipeline (schema, event store, drift engine, compiler) into first-party code, replacing only the adapter layer (§8) with an internal hook. You built the whole pipeline once; it drops into their app unchanged.
- **It reframes every component as an overlay, not a rebuild.** Search stays Myntra's. Catalog stays Myntra's. You add a *preference persistence + versioning + collaboration* layer on top. Nothing fights their architecture — the strongest possible "non-disruptive" story.

**The honest risks, and how the architecture handles them** (state these proactively — it reads as maturity):

1. **You're reading an interface you don't own.** Myntra's class names are minified and change on deploys, so DOM-scraping is brittle. **Fix:** all coupling to Myntra lives in one small **adapter module** (§8). Everything else consumes a clean internal schema. When Myntra changes their DOM, you fix one file. In a real integration, that adapter is replaced by a first-party state hook — you're reading it the hard way from outside; they'd read it the easy way from inside.
2. **Filter state lives in the URL — use that, not the DOM.** Faceted-search sites encode filters as URL params. Reading/writing the URL is far more stable than scraping, and *writing* it means Myntra's own app renders the filtered shelf for you. "Reload a profile" becomes "reconstruct the URL and navigate." (Day 0 task: confirm exactly how Myntra encodes filter state in the URL.)
3. **No private data, no ToS grey areas in the demo.** You read only what's already on the user's own screen (their applied filters) and store it in *their* account on *your* backend. You never scrape catalog data at scale or automate purchases.

---

## 4. The solution in plain language

Shelfie adds one primitive — the **Shopping Profile** — via an extension overlay on Myntra.

1. **You shop the way you already do** on Myntra.com — search + filters. Nothing new to learn. The AI is an *enhancement*, never the entry point; the product works with every ML component off.
2. **A Shelfie sidebar/badge overlays the page.** When you've built the search you want, click **Save as Shopping Profile**, name it ("School Wear"). The `search query + applied filters` (read from the URL) become a reusable, named object in your account.
3. **Reload a profile any time** — one click reconstructs the Myntra URL and the full shelf returns.
4. **Profiles are living, not frozen.** Keep shopping with a profile active; tweak filters freely. Shelfie doesn't nag or overwrite — changes sit in an **Unsaved-Changes** state (like a code editor's dirty file).
5. **When you choose to save, three honest options:** **Save as New Version** *(recommended)*, **Update Existing Version**, or **Save as New Profile**.
6. **The system helps you choose** via transparent **intent-drift detection**: Libas→Aurelia (refinement) → recommends *New Version*; Kurta→Nike shoes (new goal) → suggests *New Profile*, **with the reason shown**.
7. **Every profile is a timeline** — scrub to any past version and roll back. Preferences evolve without being lost or mixed.
8. **AI enhances where present:** auto-names/describes profiles from filters; compiles a starter profile from a sentence ("pure cotton kurtas under 1500 for school, nothing flashy"); warns when constraints are so tight the shelf is nearly empty and says which filter to relax.
9. **Opt-in behavioural suggestions** (off by default): if you keep rebuilding the same search, Shelfie *offers* to save it as a profile — a shortcut you accept or ignore. It never profiles you silently.
10. **Publish & discover:** make a profile a **public deck**; browse a **discover feed** of others' decks; **star** the good ones; **fork** any deck into your account and modify it — its whole version history copied into your space.

---

## 5. The core innovation and why it's defensible

**Core innovation:** *We turn today's disposable filter combinations into a living, version-controlled personalization system — a **Shopping Profile = a shopping intent**, **versions = the evolution of that intent** — where the boundary between "new version" and "new intent" is decided by a transparent, measurable drift computation; and we extend version control's social half (fork/star/discover) to shopping, creating a community-curated discovery surface.*

Three named, defensible pillars — not one hand-wave:

### (a) Scrutable recommendation — a real research field, barely productized
Inspectable/editable user representations have a formal name: **scrutable** and **steerable** recommendation. Key works: Radlinski et al. *On Natural Language User Profiles for Transparent and Scrutable Recommendation* (SIGIR 2022); Ramos et al. (ACL 2024); *TEARS* (Web Conf 2025); *Editable User Profiles for Controllable Text Recommendations* (SIGIR 2023). Load-bearing finding: **inspectable, editable profiles perform on par with black-box embedding recommenders** while adding transparency and control. This answers the sharpest question — *"doesn't dropping the embedding hurt accuracy?"* — with published evidence: negligible cost, large control/transparency/multi-persona gain.

### (b) "Version control for preferences" is Event Sourcing, not a metaphor
Weak teams say "it's like Git." A judge asks "what's a commit? a diff? a conflict?" and it collapses. We use **Event Sourcing** (Fowler; fintech/healthcare/audit domains): a profile is an **append-only log of immutable events**; current state is a **fold over the log**; **rollback = replay to an earlier sequence number**; no merge conflicts because a single-user profile is a linear stream. Precise, audit-grade, and it makes "refine forever, lose nothing" a structural guarantee.

### (c) Version control's *social* half applied to shopping — a blue ocean
No fashion platform has forkable, starrable, discoverable shopping intents. A public deck *"Delhi Wedding Guest — ₹3000"* with 400 stars and 50 forks is a genuinely novel discovery surface, and it maps onto both Theme 1 (Bharat discovery) and Theme 3 (creator/community). A fork is *just replaying someone's event log into a new profileId under your account* — the machinery already exists, so the social layer is cheap to add and hard to argue isn't innovative.

**Why the combination wins:** scrutability gives the *what*, event sourcing gives the *how*, drift gives the *boundary*, and fork/star/discover gives the *network*. Four pillars, all defensible, all sharing one data model.

---

## 6. Full feature set (scoped into tiers)

A grand-finale jury **interacts with your running prototype** — breadth-without-depth is punished. Build a tight core + amplifiers + one collaboration slice; bench the rest to roadmap so scoping itself signals maturity.

### CORE — must ship
| # | Feature | What it does |
|---|---------|--------------|
| C1 | Save-as-Shopping-Profile | Finished search (URL query+filters) → named saved object |
| C2 | Reload / activate a profile | One click reconstructs the Myntra URL → shelf returns |
| C3 | Unsaved-Changes + 3-way save | Dirty-state; {New Version / Update / New Profile} |
| C4 | Event-sourced timeline + rollback | Every save = a version; scrub & restore any prior state |
| C5 | Intent-drift detection | Version vs. new profile via transparent structural distance |
| C6 | Scrutable + multi-persona framing | Each named profile = one clean, inspectable persona (Bharat hook) |

### AMPLIFIERS — ship if core is solid
| # | Feature | What it does | Cost |
|---|---------|--------------|------|
| A1 | Dry-run / preview diff | "This change adds 240 products, mostly Aurelia; removes 60 Libas" | Low (set-difference) |
| A2 | Coverage / conflict advisor | "Only 8 match — over-constrained; relax which? (+120 if you drop X)" | Low (result counts) |

### COLLABORATION SLICE — the v2 blue-ocean layer (single-direction, cheap)
| # | Feature | What it does |
|---|---------|--------------|
| L1 | Publish profile as public deck | Toggle a profile public; it appears in Discover |
| L2 | Discover feed | Browse public decks (by segment, occasion, budget, popularity) |
| L3 | Star | Bookmark/upvote a deck; drives ranking & demand signal |
| L4 | Fork | Copy any public deck's full version history into your account, then modify |

### STRETCH — one, cut first
| # | Feature | What it does |
|---|---------|--------------|
| S1 | Behavioural-suggestion toggle | Opt-in; suggests saving a profile from repeated searches; off by default (§11) |
| S2 | Global negative rules | Persistent "never show polyester/crop tops" across all profiles |

### The AI enhancement layer (threaded through C1, A2, never in the critical path)
Auto-name/describe profiles; NL→profile compiler (§10); both degrade gracefully (LLM down ⇒ user types the name; core unaffected).

---

## 7. The central data model

One structured object underpins everything — the same representation we **version (C4), diff (A1), drift-check (C5), compile-from-language (AI), and fork (L4)**. One model, every payoff — nothing hand-wavy to attack.

### 7.1 The `ProfileVersion` object
```jsonc
{
  "profileId": "prof_8f2a",          // stable across all versions of one intent
  "version": 3,
  "name": "School Wear",
  "description": "Cotton workwear kurtas, nothing flashy",  // AI-suggested or user-set
  "owner": "user_amma",
  "visibility": "private",           // private | public   (drives Discover)
  "forkedFrom": null,                // or { profileId, version, owner } if this is a fork
  "stars": 0,
  "createdAt": "2026-07-21T10:14:00Z",
  "createdBy": "user | ai",

  "query": "kurta",                  // the Myntra search-box content

  "constraints": {                   // structured, executable, TYPED filter-set
    "category": { "articleType": "kurta", "gender": "women" },
    "price":    { "min": 0, "max": 1500 },
    "brand":    { "include": ["Libas"], "exclude": [] },
    "fabric":   { "include": ["pure_cotton"] },
    "sleeve":   { "include": ["three_quarter"] },
    "size":     { "include": ["XL"] },
    "color":    { "include": ["pastel","earthy"], "exclude": ["neon","sequins"] },
    "rating":   { "min": 4.0 }
  },

  "softIntent": {                    // present only if NL/fuzzy input was used
    "raw": "nothing flashy, for school as a teacher",
    "compiledTo": ["color.exclude += [neon, sequins, heavy_zari]", "occasion = workwear"]
  }
}
```

Key decisions: `constraints` is a **typed schema** (makes distance/diff/coverage computable); `softIntent` is **separate & optional** (structured filters are truth; AI only adds); `profileId` stable + `version` incrementing encodes "one intent, many versions"; `visibility`/`forkedFrom`/`stars` add the social layer without disturbing the core.

### 7.2 Stored vs. derived
We never store `ProfileVersion` as source of truth. We store **events** (§15). A `ProfileVersion` is **derived** by folding the event log — that's what makes rollback, audit, and fork free.

---

## 8. Reading Myntra's state — the adapter layer

The single most important architectural decision in the extension. **All coupling to Myntra lives in one module.** Everything else consumes Shelfie's clean internal schema.

### 8.1 What the adapter does
```
Myntra live page  ──▶  ADAPTER  ──▶  Shelfie constraint schema
  (URL params +          (one file)      (§7 constraints object)
   minimal DOM reads)
     ▲                                          │
     └──────────  ADAPTER (write path)  ◀────────┘
        reconstruct Myntra URL from a saved profile → navigate
```

- **Read path (preferred): parse the URL.** Faceted search encodes filters as query params. The adapter maps Myntra's param encoding → our typed `constraints`. Robust across DOM redesigns.
- **Read path (fallback): minimal DOM reads** for anything not in the URL (e.g., a just-typed search box before submit). Kept tiny and isolated.
- **Write path: reconstruct the URL** from a profile's constraints and navigate — Myntra's own app then renders the filtered shelf. We don't re-implement search; we drive theirs.

### 8.2 Why this is a strength, not a hack
State it out loud: *"Every Myntra-specific line is in one adapter. Redesign-proofing is a one-file fix. And in a first-party integration, this adapter is replaced by a direct read of Myntra's own filter-state store — we read it the hard way from outside so we can prove the pipeline; they'd read it the easy way from inside."* This converts the extension's inherent fragility into the integration argument.

### 8.3 Day-0 must-verify
Confirm exactly how Myntra encodes: the search query, each facet (brand, colour, size, price band), and sort, in the URL. Everything downstream depends on this. (If a facet turns out to be POST-only/DOM-only, the adapter handles it as a documented special case.)

---

## 9. The intent-drift algorithm

The crux question a judge asks first: *"How does it 'know' the intent changed — isn't that a black box?"* Here is the transparent mechanism.

### 9.1 Idea
When the **live filter-state** `L` diverges from the **active profile version** `P`, compute a **weighted structural distance** `D(P,L)`. Weights encode *how identity-defining* each attribute is: a category change defines a new intent; a colour tweak refines an existing one.

### 9.2 Distance function
Plain English: *sum the changes between saved profile and current state, weighting a category jump enormously and brand/colour/price lightly; if the total crosses a line — which it almost only does when the category changed — call it a new intent.*

```
D(P, L) = Σ_f  w_f · δ_f(P_f, L_f)
```
Per-field distance `δ_f`:
- **Set fields** (brand, fabric, colour, sleeve): **Jaccard distance** `1 − |A∩B|/|A∪B|`.
- **Numeric range** (price): `1 − overlap/union` of the two ranges.
- **Category/articleType**: dominant. `δ=0` same type; small within a vertical (kurta→kurti); `δ=1` across a **taxonomy vertical** (Ethnic Wear→Footwear).

Identity-weights (ordering is the defensible part):
```
w_category=0.60  w_brand=0.12  w_fabric=0.10  w_price=0.08
w_color=0.05     w_sleeve=0.03 w_size=0.02
```

### 9.3 Decision rule (three legible bands)
```
if categoryVerticalChanged(P,L):      → SUGGEST "New Profile"   (+ show the reason)
elif D ≥ τ_high (≈0.45):              → SUGGEST "New Profile"
elif D ≥ τ_low  (≈0.10):              → RECOMMEND "New Version"
else:                                  → OFFER "Update in place"
```

### 9.4 Why it's defensible
- **The reason is always displayable** — "Category changed: Ethnic Wear → Footwear (weight 0.60)." The algorithm *is* the explanation.
- **Degrades safely** — default is always non-destructive "New Version"; system suggests, never overwrites silently.
- **Ties to Myntra's own work** — a vertical jump is a jump between the "product groups"/context clusters in Myntra's *Decoding Fashion Contexts* paper.
- **Honest calibration** — "weights are our prior; production learns them from how often a field-change precedes a genuinely new saved profile."

### 9.5 Worked examples
| Change | D | Decision |
|---|---|---|
| Libas → Aurelia | 0.12 | New Version |
| ₹1500 → ₹1800 | 0.016 | Update in place |
| +maroon, Aurelia, ₹1800 | ~0.19 | New Version |
| Kurta → Nike shoes | vertical change | New Profile (reason shown) |

---

## 10. The fuzzy-intent compiler (AI enhancement)

Scoped as an *enhancement* to filters-first, never the only entry.

**Problem:** "nothing flashy," "for a teacher," "school-wear" are **not filters** — subjective/contextual, no dropdown captures them.

**How it works (not "we piped it to an LLM"):** the naive free-form-LLM version hallucinates non-existent filter values (`fabric:"breathable-luxe"` → zero results). We prevent it structurally with **constrained mapping against the catalog taxonomy**:
1. **Extract** candidate `(attribute, value, polarity)` triples — LLM proposes.
2. **Validate** each against the legal filter taxonomy (attribute→values lookup). "Flashy" isn't a colour → maps to `color.exclude ⊇ {neon, sequins, heavy_zari}`. Unmappable proposals are **dropped, not guessed**.
3. **Apply** only validated edits to `constraints`; log the mapping in `softIntent.compiledTo` so the user sees and can edit exactly what "nothing flashy" became (scrutability).

**Result:** the compiler *structurally cannot* emit an unexecutable/hallucinated filter. That's the answer to "how does it work under the hood?" — the defensible part is our validator, not the API.

**Lexicon** (curated, editable, itself scrutable): `flashy→exclude neon/sequins/metallic`; `office/school/teacher→occasion workwear`; `breathable/summer→fabric cotton/linen`; `budget/sasta→price.max = 30th pct`; `premium→price.min = 70th pct`.

**Fallbacks:** LLM down → NL entry hidden, filters-first fully works. LLM junk → validator drops unmappables; user finishes by hand.

---

## 11. The behavioural-suggestion engine (opt-in)

The v2 on/off toggle. **Design tension acknowledged:** Shelfie's credibility rests on being explicit and non-creepy ("we don't silently profile you"). A behavioural layer risks *becoming* the black box we critique. So it is scoped precisely:

- **Off by default. Opt-in only.** A clear toggle: "Let Shelfie suggest profiles from my repeated searches."
- **It only *suggests*, never acts.** If you rebuild a near-identical search several times, it offers: *"You've searched cotton kurtas under ₹1500 three times this week — save it as a profile?"* You accept or dismiss. It **never** silently creates or edits a profile.
- **It learns nothing about "taste."** It detects *repetition of an explicit search*, not latent preferences. Framing: *"we watch only to offer a shortcut you can decline,"* not "we learn who you are." The moment it sounds like taste-inference, the black-box critique boomerangs — so keep the scope tight.
- **Mechanism (simple, explainable):** cluster the user's recent search-states (same typed constraint schema) by the same structural distance from §9; if a cluster of near-identical searches exceeds a count threshold within a window, fire one suggestion. No model training; it's the drift metric reused.
- **Privacy posture as a selling point:** the toggle *is* the pitch — "you own your data and decide whether we even look." Aligns perfectly with the scrutable/user-control philosophy.

Position this as **stretch (S1)** — great narrative, low cost (reuses drift), cut first if time is tight.

---

## 12. The collaboration layer — fork, star, discover

The blue-ocean extension. Built as a **single-direction slice** so it's genuinely impressive *and* finishable, with the hard multi-user parts benched.

### 12.1 What we build (cheap, because the machinery exists)
- **L1 Publish** — flip a profile's `visibility` to `public`. It appears in Discover.
- **L2 Discover feed** — browse public decks, filterable by segment/occasion/budget and sortable by stars/recency. Each deck shows its name, description, constraints (scrutable!), owner, star count, fork count.
- **L3 Star** — bookmark/upvote. Drives ranking *and* a demand signal (below).
- **L4 Fork** — copy a public deck into your account. **A fork is just replaying the source's event log into a new `profileId` under your account, with `forkedFrom` set.** You now own an independent, fully-versioned copy you can modify freely. No shared state, no merge, no conflict — the single-user model stays clean.

### 12.2 Why fork/star/discover is the right 20%
Your single-user model has **no merge conflicts** because each profile is a linear stream. *Co-editing* a shared deck would reintroduce concurrent edits, divergence, and merge semantics — real distributed-systems hard problems (CRDTs/OT), not a 3-day build. **Fork = one-way copy** sidesteps all of it while delivering the entire "GitHub for shopping" narrative and a demo that lands: *"I found Priya's Cotton Workwear deck, forked it, bumped the budget, saved my version — her deck untouched."*

### 12.3 The business-impact multiplier (put this on a slide)
The Discover graph is a **catalog-demand signal for Myntra.** Aggregate the most-starred / most-forked / most *thinly-covered* decks (via A2's coverage metric) and you're telling Myntra merchandising **exactly which Bharat-relevant inventory is missing** — closing Theme 1's "catalog gap" from the demand side. A public deck with 500 stars and poor catalog coverage is a precise buy-this-inventory instruction.

### 12.4 The creator angle (touches Theme 3)
A fashion creator publishing curated, forkable decks ("Budget Office Capsule," "Festive Under ₹2000") is exactly the creator-commerce pattern Myntra's own competitive gaps flag. Decks make creators' taste *forkable and shoppable*, not just viewable.

### 12.5 Benched (roadmap, §20)
Multi-user **co-editing** of one shared deck (merge semantics); **cross-user branches** that later reconcile; roles/permissions; moderation of public decks. If asked, show you know *why* they're hard ("co-editing needs concurrent-edit merge; we'd use CRDTs; deliberately out of MVP").

---

## 13. Technology stack — chosen for this project

Chosen for *this* project (extension on live Myntra, 3 people, ~3 days, jury runs your prototype, event sourcing + light ML + a social layer + a polished overlay UI). The desktop-extension framing lets us use a robust stack without mobile constraints.

### 13.1 The event-store decision
| Option | Verdict |
|---|---|
| Full **Axon Framework** (Java) — textbook ES/CQRS, max credibility, heavy setup | **Bench** — cite as production path |
| **Event sourcing on PostgreSQL directly** — append-only `events`, state=fold, rollback=replay; ~150 lines you fully control; stands up in an hour | ✅ **Recommended** |

Say in the deck: *"We implemented the Event Sourcing pattern directly on Postgres; the production path is Axon/EventStoreDB, architected-for but unneeded at MVP scale."* Full backend credit **and** anti-over-engineering judgment.

### 13.2 Full stack
| Layer | Choice | Why |
|---|---|---|
| **Extension** | **Chrome/Edge extension, Manifest V3** (content script + side panel) | Runs on live Myntra; the integration-credibility play. MV3 side panel gives a persistent, app-like sidebar |
| **Extension UI** | **React + Vite + Tailwind**, injected into the side panel | Fast, polished, component-based; same React skills across UI |
| **Adapter module** | **Vanilla TS**, isolated | All Myntra-coupling in one file (§8); redesign-proof by construction |
| **Extension state** | **Zustand** | Clean dirty-state tracking (working set vs. active profile) |
| **Backend API** | **FastAPI (Python)** | Fast REST; same language as ML/compiler; auto OpenAPI docs |
| **Event store + read model + catalog cache + social graph** | **PostgreSQL** | Append-only `events` (write) + `profile_versions` projection (read) = real CQRS; also stores decks, stars, forks. One boring, reliable DB |
| **Search/coverage** | Query a **seeded catalog** in Postgres (full-text + trigram) for coverage/diff counts | We compute coverage/diff against a representative catalog; live shelf rendering is Myntra's own via URL navigation |
| **Fuzzy compiler** | **LLM API (extract) + local taxonomy validator (approve)** | Defensible part is our validator, not the API |
| **Drift + behavioural engine** | **Plain Python module** (weighted distance) | Deterministic, explainable — deliberately *not* a model |
| **Deploy** | **Docker Compose** (Postgres+FastAPI) on one host; **Render/Railway** for a public API; extension loaded unpacked / packed .crx for judges | Judges interact live; one-command bring-up de-risks the finale |

### 13.3 Deliberately avoided
No Elasticsearch/Kafka/microservice sprawl (ES-on-Postgres tells the same story, less ops risk). No model training (drift is deterministic *on purpose* — explainability is the selling point). No auth beyond a lightweight account + persona switcher.

### 13.4 The two-surface reality (be clear about it)
- **Live shelf** = Myntra's own page, driven by URL navigation (we don't re-render products).
- **Computed views** (coverage counts, dry-run diffs, discover cards) = run against our **seeded catalog** in Postgres. Be explicit it's a representative proxy with a first-party ingestion path. This split is honest and it keeps the demo robust (you're not scraping Myntra's catalog at scale).

---

## 14. System architecture

```
┌───────────────────────────── BROWSER (on myntra.com) ─────────────────────────────┐
│                                                                                    │
│   Myntra page (their DOM, their search, their shelf)                               │
│        ▲   │ URL read/write                                                         │
│        │   ▼                                                                        │
│   ┌─────────────────┐     ┌──────────────────────────────────────────────────┐    │
│   │  ADAPTER (1 file)│────▶│  Shelfie side panel (React + Zustand)            │    │
│   │  URL ⇄ schema    │     │  • working set vs. active profile (dirty badge)  │    │
│   └─────────────────┘     │  • save sheet / 3-way save / timeline / rollback │    │
│                            │  • Discover feed / deck cards / star / fork      │    │
│                            │  • persona switcher · behavioural toggle         │    │
│                            └───────────────────────┬──────────────────────────┘    │
└────────────────────────────────────────────────────┼───────────────────────────────┘
                                                     │ REST (JSON)
                                                     ▼
┌────────────────────────────────── FastAPI backend ────────────────────────────────┐
│  /profiles (create/list/activate)   /profiles/{id}/commit  /rollback              │
│  /drift → D(P,L)+reason   /compile → NL→validated edits   /coverage → counts+diff  │
│  /decks (publish/discover)  /decks/{id}/star  /decks/{id}/fork → replay into user  │
│  /behaviour/suggest (opt-in)                                                        │
│   ┌────────────┐ ┌─────────────────┐ ┌───────────────┐ ┌────────────────────────┐  │
│   │Drift engine│ │Fuzzy compiler   │ │Coverage/diff  │ │Fork = replay event log │  │
│   │(pure Py)   │ │(LLM→validate)   │ │(counts)       │ │into new profileId      │  │
│   └────────────┘ └─────────────────┘ └───────────────┘ └────────────────────────┘  │
└────────────────────────────────────────────┬───────────────────────────────────────┘
                                             ▼
┌────────────────────────────────── PostgreSQL ─────────────────────────────────────┐
│  WRITE (truth):  events(event_id, profile_id, seq, type, payload, actor, ts)       │
│  READ (proj.):   profile_versions(...)   active_profile(user, persona, ...)        │
│  SOCIAL:         decks(profile_id, visibility, stars, fork_count)                  │
│                  stars(user, profile_id)   forks(src_profile, new_profile, user)   │
│  CATALOG (proxy):products(id, articleType, brand, fabric, price, color, ...)       │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Three sub-systems: **A) shopping surface** = Myntra's own page + adapter (no innovation, must feel real); **B) profile engine** = create/activate/commit/rollback/fork as events (the innovation); **C) intelligence + social** = drift, compiler, coverage, discover/star/fork (enhancements, all optional to the core loop).

---

## 15. Event sourcing, concretely (now with forks)

### 15.1 Event log (write model)
```sql
CREATE TABLE events (
  event_id   BIGSERIAL PRIMARY KEY,
  profile_id TEXT NOT NULL,
  seq        INT  NOT NULL,          -- monotonic per profile
  type       TEXT NOT NULL,          -- ProfileCreated|FilterChanged|VersionCommitted|RolledBack|ForkedFrom
  payload    JSONB NOT NULL,
  actor      TEXT NOT NULL,          -- user | ai
  ts         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (profile_id, seq)
);  -- append-only: never UPDATE/DELETE
```

### 15.2 Example stream (with a fork)
```jsonc
{ "seq":1, "type":"ProfileCreated",   "payload":{ "name":"School Wear","constraints":{…} } }
{ "seq":2, "type":"VersionCommitted", "payload":{ "version":1 } }
{ "seq":3, "type":"FilterChanged",    "payload":{ "brand.include":["Aurelia"] } }
{ "seq":4, "type":"VersionCommitted", "payload":{ "version":2 } }
{ "seq":5, "type":"RolledBack",       "payload":{ "toVersion":1 } }
// A different user forks the public deck at v2:
{ "seq":1, "type":"ForkedFrom",       "payload":{ "src":"prof_8f2a","srcVersion":2 },
                                        "profile_id":"prof_NEW", "actor":"user_divya" }
{ "seq":2, "type":"VersionCommitted", "payload":{ "version":1 } }   // divya's v1 == amma's v2
```

### 15.3 State = fold; rollback = replay; fork = replay-into-new
```python
def project(events):                    # events sorted by seq
    s = EMPTY
    for e in events: s = apply(s, e)     # pure reducer per event type
    return s

def state_at_version(events, v):        # any past version
    return project(prefix_up_to_commit(events, v))

def fork(src_events, src_version, new_owner):
    base = state_at_version(src_events, src_version)
    return [ Event("ForkedFrom", {...}), Event("ProfileCreated", base), Event("VersionCommitted", {version:1}) ]
```
- Current state = fold over all events. Past version = fold over a prefix. Rollback appends `RolledBack` (history preserved). **Fork = project source to a version, then seed a fresh linear stream under the new owner** — clean, no shared mutable state.

### 15.4 Read model = disposable projection
`profile_versions` and `decks` are caches rebuildable from events (`DELETE; replay;`). "The log is truth, the read model is disposable" = the essence of CQRS.

### 15.5 Jury-ready line
> *"A profile's state is a fold over an append-only event log; rollback is a replay to a prior sequence; a fork is that same log replayed into a new owner's stream. It's the pattern fintech uses for audit-grade history — applied to shopping intents, with GitHub-style forking on top."*

---

## 16. User interface & interaction design

Desktop side-panel overlay on Myntra. Everything below is tappable in a live demo and legible on video.

### 16.1 The overlay
A Shelfie **side panel** (MV3) pinned beside Myntra's page, plus a slim **status bar** injected above the results:
- No profile active: `● Unsaved search — Save as Shopping Profile`
- Active & clean: `✓ School Wear · v2`
- Active & modified: `✎ School Wear · v2 — Unsaved changes` (amber)

### 16.2 Save-as-Profile (bottom of side panel)
```
Save as Shopping Profile
Name: [ School Wear            ]   ✨ Suggested: "Cotton Workwear Kurtas"
This profile saves:
 • "kurta" · ₹0–1500 · Libas · pure cotton
 • 3/4 sleeve · XL · rating 4.0+ · excludes neon, sequins
[ Make public ▢ ]        [ Save Profile ]
```
The "This profile saves" list = **scrutability made visible**. A `Make public` checkbox seeds the collaboration layer at creation time.

### 16.3 The 3-way save (signature interaction)
```
You've changed "School Wear"
Changed: Brand Libas → Aurelia
ⓘ Looks like a refinement (brand changed, category same).
● Save as New Version  (recommended)     ○ Update this version     ○ Save as a New Profile
[ Preview changes ]                                   [ Confirm ]
```
Vertical-change variant:
```
This looks like a new shopping goal 🎯
You moved from  Ethnic Wear → Kurtas   to   Footwear → Running Shoes
We suggest a New Profile so "School Wear" stays intact.
● Save as New Profile (recommended)   ○ …save as a version of School Wear
```
System **suggests, never forces** — the alternate option is always present.

### 16.4 Dry-run diff (A1)
```
Saving this version changes your shelf:
  + 240 added (mostly Aurelia)   − 60 removed (Libas)   = 312 total
```

### 16.5 Version timeline & rollback (C4)
```
School Wear
  ○ v1 · Libas · ₹1500 · cotton      [ Restore ]
  ○ v2 · Aurelia · ₹1500 · cotton     [ Restore ]  ← current
  ● live · Aurelia · ₹1800 · +maroon  (unsaved)
```
Restore v1 → appends `RolledBack` → adapter rewrites the Myntra URL → shelf reverts live.

### 16.6 Persona switcher (C6 / Bharat)
```
Shopping as: [ 👩 Amma ▾ ]   • 👩 Amma (School Wear, Festive Sarees)  • 👧 Divya (College Fusion, Sneakers)  • 👦 Arjun (Cricket Gear)
```
Switching swaps the active profile set — the entire shared-account solution, nearly free because profiles are already separate objects.

### 16.7 Discover / deck card (L1–L4)
```
🔥 Discover
┌─────────────────────────────────────────────┐
│ Cotton Workwear Kurtas · by @priya           │
│ ₹0–1500 · pure cotton · 3/4 · non-flashy      │
│ ★ 412   ⑃ 57 forks                            │
│ [ ★ Star ]  [ ⑃ Fork to my profiles ]  [ View ]│
└─────────────────────────────────────────────┘
```
Fork → creates your own versioned copy (its history replayed into your account) that you can immediately modify.

### 16.8 Behavioural toggle (S1)
In settings: `▢ Let Shelfie suggest profiles from my repeated searches (off by default)`. When on and triggered: a dismissible nudge — *"Saved this search 3× this week — save as a profile?"*

---

## 17. The 3-day build plan with fallbacks

Team of 3. **BE** (event store + API), **FE** (extension + UX), **ML/Glue** (adapter + drift + compiler + data). Every risky step has a fallback.

### Day 0 (setup night, 2–3 hrs)
- Extension skeleton (MV3, side panel injects a React app on myntra.com) + Docker Compose (Postgres+FastAPI) one-command up. **Fallback:** run processes locally if Docker fights you.
- **Verify Myntra URL filter encoding** (§8.3) — the single highest-risk unknown; do it first. **Fallback:** if some facets are DOM-only, adapter reads those from DOM as documented special cases.
- Seed the **proxy catalog** (5–20k products, real attributes). **Fallback:** generate from attribute permutations.
- Lock the `ProfileVersion` schema (§7) — the contract all three build against.

### Day 1 — the spine (save & reload, end to end on live Myntra)
| Owner | Task | Fallback |
|---|---|---|
| ML | **Adapter**: URL → constraints (read) + constraints → URL (write) | If write-nav is flaky, at least read+display; reload can copy URL to clipboard as stopgap |
| BE | `events` table + fold/projection + `/profiles`, `/commit` | Store `ProfileVersion` rows directly today, refactor to events Day 2 (try hard to do events now) |
| FE | Side panel + status bar + working-set tracking + Save sheet | Paginate/limit rendering; keep the panel simple |

**Must-have EOD1:** on real Myntra, build a search → Save as Profile → reload → filters restore via URL.

### Day 2 — the innovation (versions, rollback, drift)
| Owner | Task | Fallback |
|---|---|---|
| BE | `VersionCommitted`/`RolledBack` events; `/rollback`; timeline endpoint | "Restore = new version copying old constraints" if replay-rollback is tricky |
| FE | Unsaved badge + 3-way modal + timeline + Restore | Simple version list + Restore buttons suffices |
| ML | Drift `/drift`: weighted distance + 3 bands + **reason string** | Hardcode the category-vertical rule first — covers the headline demo |

**Must-have EOD2:** modify active profile → correct, explained 3-way save → save v2 → rollback to v1 → shelf reverts live.

### Day 3 — social slice + amplifiers + polish + demo (freeze by evening)
| Owner | Task | Fallback |
|---|---|---|
| BE | `/decks` publish + discover + `/star` + **`/fork` (replay into new profileId)** | Fork can copy latest version only if full-history replay slips — still demoable |
| FE | Discover feed + deck cards + star + fork + persona switcher + **visual polish** | Persona switcher = hardcoded 3-persona dropdown |
| ML | Dry-run diff + coverage advisor; fuzzy compiler (LLM→validate) + auto-name | **Biggest fallback:** ship lexicon-only compiler (deterministic keyword→filter) if LLM is shaky — the *validator* is the impressive part and needs no LLM |
| All | Record 3-min video **early** + freeze + rehearse live demo + build deck | Video-first guarantees a submittable artifact |

**Submission July 24, 1:00 PM IST** — Day 3 evening is the hard freeze; record video + push repo with margin.

**Sequencing rule:** build **vertically** — one thin slice working before any depth. If behind, cut S1/S2, then amplifiers, then the social slice; **never** the core save→reload→version→rollback loop.

---

## 18. How to demo it in 3 minutes

One story, one character, on the **live Myntra site**.

1. **(0:00–0:25) Pain.** "Lakshmi, a Coimbatore schoolteacher, wants cotton workwear kurtas." Stack filters on real Myntra — query, ₹1500, cotton, 3/4, XL, Libas, exclude neon. "Twelve clicks. Perfect shelf. Watch every app today —" close tab. "Gone. Next week, twelve clicks again."
2. **(0:25–0:55) Save the route.** Rebuild, **Save as Shopping Profile → "School Wear"** (show AI-suggested name). Close, reopen Myntra, one click on School Wear → the real shelf returns via URL. "Wishlist saves products. Shelfie saves the *intent*."
3. **(0:55–1:40) Living, versioned.** Libas→Aurelia → amber Unsaved. Save → 3-way modal, **New Version pre-selected, reason shown**. **Preview** → "+240 Aurelia, −60 Libas." Save v2. Timeline → **Restore v1** → shelf snaps back. "Refine forever, lose nothing."
4. **(1:40–2:10) New-intent moment.** Search Nike shoes with School Wear active → **"New shopping goal — Ethnic Wear → Footwear. New profile?"** "It knows refine vs. restart — and tells you why."
5. **(2:10–2:40) GitHub for shopping + Bharat.** Open **Discover** → fork **@priya's "Cotton Workwear"** deck → tweak budget → save *your* version. Switch persona **Amma→Divya** → different profiles, Amma's untouched. "One account, whole household, and a community of shareable, forkable shopping intents — nobody's taste corrupts anyone else's."
6. **(2:40–3:00) Line.** "Shelfie — we turned the finished search from disposable into durable, and made it shareable. And it runs on Myntra today."

---

## 19. Defending it in the jury Q&A

**"Isn't this a saved search?"** A saved search is frozen. Shelfie is a *version-controlled intent* — event-sourced timeline, transparent drift (refine vs. new goal), multi-persona separation, and forkable/discoverable. A frozen filter-set can't answer "I changed my mind but want the old one back," nor "share this with my sister."

**"How does it know intent changed — black box?"** Weighted structural distance over the constraint schema (§9), dominated by a taxonomy-vertical term, three-band threshold, reason always shown. We can print each field's contribution. Opposite of a black box.

**"Doesn't dropping embeddings hurt accuracy?"** Scrutable-recommendation literature (Radlinski '22, Ramos '24, TEARS '25) shows inspectable profiles perform on par with embeddings while adding control — a good trade for shared-account Bharat.

**"Your compiler is just an LLM — hallucinations?"** LLM only *proposes* triples; our deterministic validator drops anything not in the catalog taxonomy before it touches constraints. It structurally can't emit an unexecutable filter. The defensible part is our validator.

**"Why event sourcing — overkill?"** It's the minimum honest way to deliver lossless, restorable history *and* clean forks. State = fold; rollback = replay; fork = replay-into-new; read model = disposable projection. Implemented on Postgres at MVP scale; Axon/EventStoreDB is the production path.

**"It's an extension reading your site — brittle/ToS?"** All coupling is one adapter reading the user's *own* filter state from the URL (robust across redesigns); we read only what's on the user's screen, store it in their account, never scrape catalog at scale or automate actions. In a first-party integration the adapter is replaced by an internal state hook — the pipeline is unchanged.

**"What about co-editing a shared deck?"** Deliberately out of MVP — co-editing needs concurrent-edit merge (CRDTs/OT), a distributed-systems problem. Fork (one-way copy) delivers the collaboration value without it; co-editing is on the roadmap.

**"Does it scale?"** Write model append-only (shardable by profile_id); read model rebuildable; drift O(#fields); search stays Myntra's. It's an overlay, not a replacement — nothing fights their architecture.

**"Business impact?"** Reload beats re-searching 12 filters → higher return-visit conversion on the recurring purchases that dominate T2/T3. Persona separation improves relevance for the 65% shared accounts. Discover graph = a **catalog-demand signal** telling merchandising which Bharat inventory is missing (starred-but-thinly-covered decks). And saved+shared profiles are a reason to return to Myntra specifically — retention.

---

## 20. Roadmap (what we deliberately did not build)

Framing cuts as roadmap signals judgment.

- **Multi-user co-editing of shared decks** — concurrent-edit merge (CRDTs/operational transforms); the genuinely hard distributed-systems piece. Fork covers the value for now.
- **Cross-user branches that reconcile** — branch a deck, diverge, later merge selected changes back.
- **Branching/forking within one user's account** — variations of one intent (fork "School Wear" → "Wedding-Guest," keep fabric+price, change occasion+colour). Deferred as it competes with the version-vs-new-profile model; needs UX to not confuse the timeline.
- **Learned drift weights** — fit `w_f` from data (how often a field-change precedes a new saved profile).
- **Vernacular intent capture** — profiles stated in Hindi/Kannada; the compiler's validator already generalizes, needs a multilingual extraction front-end.
- **Full Axon/EventStoreDB** — audit-grade production event store.
- **Merchandising console** — turn the Discover demand-signal into a first-party dashboard for Myntra's category teams.
- **First-party state hook** — replace the adapter with a direct read of Myntra's filter store when integrated natively.

---

## 21. Glossary

- **Shopping Profile** — a named, saved object representing one shopping *intent* (query + structured filters). The core primitive.
- **Version** — one saved state of a profile; a profile is a timeline of versions capturing how one intent evolved.
- **Working set / live filter-state** — the query+filters currently applied (read from Myntra's URL), before saving; compared to the active profile to detect changes.
- **Unsaved-Changes (dirty) state** — working set differs from the active version; borrowed from code-editor "unsaved file" UX.
- **Constraint schema** — the typed structure holding all filters; being typed (not free text) makes distance/diff/coverage computable.
- **Adapter layer** — the single module translating Myntra's URL/DOM state ⇄ Shelfie's constraint schema; isolates all site-specific coupling.
- **Scrutable recommendation** — a user representation the user can directly inspect and modify; a real IR/RecSys research area; on par with black-box embeddings.
- **Steerable recommendation** — closely related; the user actively steers what they're recommended.
- **Event Sourcing** — state stored as an append-only log of immutable events; current state is a fold over the log; enables audit trails and time-travel by construction.
- **Fold (reduction)** — repeatedly applying a function across a sequence to accumulate a result; here, replaying events to build current profile state.
- **CQRS** — separating the write model (events, truth) from the read model (a query-optimized, disposable projection).
- **Projection / read model** — a query-friendly cache derived from the event log; deletable and rebuildable by replay.
- **Rollback** — returning a profile to an earlier version by replaying the log to that point (recording a `RolledBack` event; history never deleted).
- **Fork** — copying a public deck by replaying its event log into a new profileId under a different owner; produces an independent, fully-versioned copy. No shared mutable state ⇒ no merge conflicts.
- **Star** — bookmark/upvote of a public deck; drives Discover ranking and the catalog-demand signal.
- **Discover feed** — browsable list of public decks; also the aggregate demand signal for merchandising.
- **Intent drift** — how far the working set has diverged from the active profile; a weighted structural distance.
- **Weighted structural distance `D(P,L)`** — Σ over fields of (per-field distance × identity-weight); decides version vs. new profile.
- **Jaccard distance** — for set fields: `1 − |A∩B|/|A∪B|`.
- **Taxonomy vertical** — a top-level category branch (Ethnic Wear, Footwear…); crossing one is the dominant "new intent" signal.
- **Fuzzy-intent compiler** — translates subjective language ("nothing flashy") into validated, executable constraint edits: LLM *proposes*, a deterministic validator *approves*.
- **Taxonomy validation** — checking every proposed filter value exists in the catalog's legal attribute→values, so the compiler can't hallucinate a filter.
- **Behavioural-suggestion engine** — opt-in, off-by-default; detects repeated near-identical searches (via the drift metric) and *suggests* saving a profile; never auto-creates or profiles taste.
- **Coverage / conflict advisor** — warns when constraints match very few products and names the single constraint to relax for the biggest result-count gain.
- **Dry-run / preview diff** — pre-save set-difference of the result shelf (products added/removed) a change would cause.
- **Persona (multi-persona)** — a distinct set of profiles belonging to one person on a shared account; the switcher keeps household members' intents separate.
- **Manifest V3 / side panel** — the modern browser-extension platform and its persistent side-panel surface, used for the Shelfie overlay.

---

*End of v2. Build vertically, freeze early, demo one clear story — on the live site.*
