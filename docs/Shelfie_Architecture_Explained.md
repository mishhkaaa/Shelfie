# Shelfie — Architecture, Explained Simply (Teaching Edition)

**Purpose of this document:** so you can *understand* every part yourself, and then *teach it to your teammates* without stumbling. Every hard word is broken down the first time it appears. Every big diagram is split into small ones. Every concept has a tiny real-world example.

**How to read this:** top to bottom. We start with a 10,000-foot picture, then zoom into each box one at a time. Don't try to hold the whole thing in your head — that's the whole point of breaking it up.

---

## Part 0 — The one-paragraph mental model (start here)

Imagine Myntra is a huge shop, and every time you visit you spend 10 minutes arranging the shelves *exactly* how you like them (filters). Right now, the moment you leave, the shop resets the shelves. **Shelfie is a little notebook clipped to your browser that writes down "how you arranged the shelves," gives that arrangement a name ("School Wear"), and lets you re-arrange the real shop shelves that way again with one click** — plus keep a history of every arrangement, keep your arrangements separate from your family's, and even share arrangements with other shoppers like recipes.

That's it. Everything below is just *how* we build that notebook well.

---

## Part 1 — The big picture (overview diagram)

This is the only "whole system" diagram. Don't worry about the details yet — just get the shape. We zoom into each numbered block afterward.

```
                        ┌───────────────────────────────────────────┐
                        │            YOUR LAPTOP BROWSER              │
                        │         (you are on myntra.com)             │
                        │                                             │
   ①  ┌──────────────┐  │   ②  ┌──────────────┐   ③ ┌─────────────┐  │
       │ Myntra's own │──┼─────▶│  ADAPTER     │────▶│ Shelfie     │  │
       │ website      │  │      │ (translator) │     │ side panel  │  │
       │ (shelves,    │◀─┼──────│              │◀────│ (your UI)   │  │
       │  filters)    │  │      └──────────────┘     └──────┬──────┘  │
       └──────────────┘  │                                  │         │
                        └───────────────────────────────────┼─────────┘
                                                            │ internet
                                                            │ (API calls)
                                                            ▼
                        ┌───────────────────────────────────────────┐
                        │            SHELFIE SERVER (cloud)           │
                        │                                             │
                        │  ④ ┌──────────────┐  ⑤ ┌────────────────┐  │
                        │     │ Brain modules │    │ Memory          │  │
                        │     │ (drift, AI,   │────│ (database:      │  │
                        │     │  coverage,    │    │  the notebook   │  │
                        │     │  fork)        │    │  itself)        │  │
                        │     └──────────────┘    └────────────────┘  │
                        └───────────────────────────────────────────┘
```

**The five blocks in one line each:**

1. **Myntra's website** — the real shop. We don't rebuild it; we sit on top of it.
2. **The Adapter** — a *translator* between Myntra's language and Shelfie's language. (Explained in Part 3.)
3. **The side panel** — the Shelfie buttons and screens you see, tucked beside the Myntra page.
4. **Brain modules** — the small pieces of logic that do the clever things (decide "new version vs new profile," turn a sentence into filters, etc.).
5. **Memory (database)** — where all your saved profiles and their history physically live.

> **Jargon decoded:**
> - **Browser extension** = a small add-on program that lives inside Chrome/Edge and can add things to web pages you visit. (Like an ad-blocker, but ours adds a shopping notebook.)
> - **Side panel** = a strip of UI that sits beside the webpage, always visible. Modern browsers officially support this.
> - **API call** = one computer politely asking another computer for something over the internet ("save this profile please," "give me my profiles"). Think of it as sending a text message with a specific request and getting a reply.
> - **Server / cloud** = a computer that's always on, somewhere else, that stores everyone's data and does shared work. Your laptop talks to it.
> - **Database** = an organized digital filing cabinet. Ours stores the profiles.

Now we zoom in, block by block.

---

## Part 2 — What actually happens when you use it (the pipeline, step by step)

Before diagrams of *parts*, here's the **flow** — the journey of one action from your click to the saved result. We'll trace **"Lakshmi saves her kurta search as a profile."**

```
STEP 1                STEP 2               STEP 3              STEP 4             STEP 5
Lakshmi has     →     She clicks     →     Adapter reads   →   Side panel    →    Server stores
filters applied       "Save as             the filters         sends them          it as events
on Myntra             Profile" in          off the URL         to the server       in the database
(the shop)            Shelfie panel                            (API call)          (the notebook)
```

Let's walk each step in plain words:

- **Step 1 — Lakshmi has filters applied.** She typed "kurta" and clicked filters: ₹1500, cotton, XL, Libas. Myntra shows her the matching shelf. All normal Myntra.
- **Step 2 — She clicks "Save as Profile."** This is the *only* new thing she does. A little box pops up in the Shelfie side panel asking for a name.
- **Step 3 — The Adapter reads the filters.** Here's the clever bit: Shelfie needs to know *what* filters are applied. Instead of trying to read Myntra's messy screen, it reads the **web address (URL)** at the top of the browser, which secretly contains all the filters (explained next). It translates that into a clean list Shelfie understands.
- **Step 4 — The side panel sends it to the server.** An API call: "Save this profile named 'School Wear' with these filters for user Lakshmi."
- **Step 5 — The server stores it.** Not as a simple note, but as an *event* in a history log (explained in Part 6). This is what lets her undo later.

And **reloading** is the same pipeline in reverse:

```
Lakshmi clicks   →   Server sends    →   Adapter rebuilds  →   Browser goes to    →   Myntra shows
"School Wear"        back the saved      the Myntra URL        that URL               the exact shelf
                     filters             from the filters                             again
```

**The key insight to teach:** *Shelfie never re-creates Myntra's shop. It just remembers the "address" of a perfect shelf arrangement and drives the real Myntra to that address again.*

---

## Part 3 — Zoom into ② The Adapter (the translator)

This is the piece most people find confusing, so we go slow.

### 3.1 The problem the Adapter solves

Myntra and Shelfie "speak different languages":
- **Myntra's language:** a long messy web address like
  `myntra.com/kurtas?f=brand:Libas&color:blue&price:0_1500&size:XL`
- **Shelfie's language:** a tidy structured list:
  ```
  brand = Libas
  color = blue
  price = 0 to 1500
  size  = XL
  ```

The Adapter is the **translator** between the two. Every message crossing the border goes through it.

```
        MYNTRA SIDE                  ADAPTER               SHELFIE SIDE
   ┌──────────────────────┐      ┌────────────┐      ┌────────────────────┐
   │ messy URL:           │      │            │      │ clean list:        │
   │ ?f=brand:Libas&      │─────▶│ TRANSLATE  │─────▶│ brand=Libas        │
   │   color:blue&        │ read │ (URL →     │      │ color=blue         │
   │   price:0_1500       │      │  list)     │      │ price=0-1500       │
   └──────────────────────┘      └────────────┘      └────────────────────┘

   ┌──────────────────────┐      ┌────────────┐      ┌────────────────────┐
   │ browser navigates    │◀─────│ TRANSLATE  │◀─────│ saved profile:     │
   │ to rebuilt URL       │write │ (list →    │      │ brand=Libas ...    │
   │ → shelf appears      │      │  URL)      │      │                    │
   └──────────────────────┘      └────────────┘      └────────────────────┘
```

### 3.2 Why read the URL and not the screen?

Two ways to find out what filters are applied:
- **Reading the screen (the DOM):** looking at the visual page and trying to spot which checkboxes are ticked. **Fragile** — Myntra redesigns their page often, and the checkboxes' hidden names are scrambled gibberish that changes. If we rely on this, our tool breaks whenever Myntra updates.
- **Reading the URL:** the web address already lists the filters as text. It's **stable** — even after redesigns, the address format rarely changes, because Myntra's own app relies on it too.

So we prefer the URL. It's like reading the label on a box instead of guessing the contents by shaking it.

> **Jargon decoded:**
> - **URL** = the web address in your browser's top bar. For shopping sites, it usually contains the filters as text after a `?`.
> - **DOM** = "Document Object Model," a fancy name for *the structure of the visible webpage*. Reading the DOM = reading the actual on-screen page elements. We avoid this where we can.

### 3.3 Why we keep ALL of this in ONE file

Everything Myntra-specific lives in this single Adapter. The rest of Shelfie doesn't know or care that Myntra exists — it only speaks the clean list language.

**Why this matters (teach this):** if Myntra changes their website tomorrow, we fix **one file**, and the whole rest of the system keeps working untouched. It's like having one power adapter for a foreign country — change the adapter, and all your devices still work.

**Bonus pitch point:** if Myntra ever adopts Shelfie officially, they throw away this Adapter and plug Shelfie straight into their own system (which is even easier for them). So the Adapter is the "we did it the hard way from outside so we could prove it works" piece.

---

## Part 4 — Zoom into ③ The Side Panel (what the user sees)

The side panel is the Shelfie app itself, shown as a strip beside Myntra. Inside it are several "screens." Here's the panel broken into its screens:

```
┌─────────────── Shelfie SIDE PANEL ───────────────┐
│                                                   │
│  [ 👩 Amma ▾ ]         ← A. Persona switcher      │
│  ─────────────────────────────────────────────    │
│  ✎ School Wear · v2 — Unsaved changes             │  ← B. Status bar
│  ─────────────────────────────────────────────    │
│                                                   │
│  MY PROFILES            ← C. Your saved profiles  │
│   • School Wear (v2)                              │
│   • Festive Sarees (v5)                           │
│                                                   │
│  [ + Save current search as Profile ]  ← D. Save  │
│                                                   │
│  ─────────────────────────────────────────────    │
│  🔥 DISCOVER            ← E. Community decks       │
│   • Cotton Workwear · @priya · ★412  [Fork]       │
│                                                   │
└───────────────────────────────────────────────────┘
```

Each labelled area (A–E) is a feature you'll see as a "user board" in Part 10. For now just know: **the panel is where all Shelfie interaction happens, so the Myntra page underneath stays 100% normal.**

> **Why a side panel and not a popup?** A popup closes when you click away, which is annoying while shopping. A side panel stays open beside the shop the whole time — like having a shopping list taped to the edge of your screen.

---

## Part 5 — Zoom into ④ The Brain Modules (the clever logic)

The server has four small "brains," each doing one job. **They're separate on purpose** — if one breaks or is switched off, the others keep working. Here they are as separate small boxes:

```
┌────────────────────────────────────────────────────────────┐
│                     SHELFIE SERVER BRAINS                    │
│                                                             │
│  ┌───────────────┐   ┌───────────────┐                      │
│  │ Brain 1:      │   │ Brain 2:      │                      │
│  │ DRIFT ENGINE  │   │ FUZZY         │                      │
│  │               │   │ COMPILER      │                      │
│  │ "is this a    │   │ "turn a       │                      │
│  │ new version   │   │ sentence into │                      │
│  │ or new goal?" │   │ filters"      │                      │
│  └───────────────┘   └───────────────┘                      │
│                                                             │
│  ┌───────────────┐   ┌───────────────┐                      │
│  │ Brain 3:      │   │ Brain 4:      │                      │
│  │ COVERAGE      │   │ FORK ENGINE   │                      │
│  │ ADVISOR       │   │               │                      │
│  │ "too few      │   │ "copy someone │                      │
│  │ results —     │   │ else's deck   │                      │
│  │ relax what?"  │   │ into your acct"│                     │
│  └───────────────┘   └───────────────┘                      │
└────────────────────────────────────────────────────────────┘
```

We give **Brain 1 (Drift)** its own deep section (Part 7) because it's the star of the show and the thing judges will grill. Brains 2–4 get shorter treatments (Parts 8, 9, and 12). Let's do the memory first, because the brains use it.

---

## Part 6 — Zoom into ⑤ The Memory (database) and the BIG idea: event sourcing

This is the second concept people find hard. We go very slow and use an analogy the whole way.

### 6.1 The naive way (what most apps do) — and why it's weak

Most apps store your profile like a single sticky note:

```
   ┌─────────────────────────────┐
   │  School Wear                │
   │  brand = Aurelia            │   ← if you change brand,
   │  price = 1500               │      you ERASE "Libas" and
   │  fabric = cotton            │      write "Aurelia" on top.
   └─────────────────────────────┘      The old value is GONE forever.
```

Problem: once you change something, the old version is **erased**. You can never go back. That's the sticky-note approach.

### 6.2 Our way — the "diary" approach (event sourcing)

Instead of one sticky note we keep a **diary that we only ever add to, never erase.** Each line is one thing that happened:

```
   THE DIARY (event log) — we only ADD lines, never erase
   ─────────────────────────────────────────────────────────
   Line 1:  Created profile "School Wear" with brand=Libas, price=1500, cotton
   Line 2:  Committed as Version 1
   Line 3:  Changed brand to Aurelia
   Line 4:  Committed as Version 2
   Line 5:  Rolled back to Version 1
   ─────────────────────────────────────────────────────────
```

**To know the profile's current state, you read the diary from the top and "play it forward" in your head** — start empty, apply line 1, then line 2, and so on. This "playing forward" is the only trick you need to understand.

### 6.3 The analogy that makes it click

Think of a **bank account**. The bank does **not** just store "your balance = ₹5000." It stores every **transaction**: +₹2000 salary, −₹500 groceries, +₹3500 refund… Your balance is *calculated* by adding up all transactions.

Why does the bank do this? So there's a complete, tamper-proof history. You can see every change, dispute any one, and prove what happened.

**Shelfie treats your shopping preferences exactly like a bank treats money.** Every change is a transaction in the diary. Your "current profile" is the running total.

> **Jargon decoded:**
> - **Event** = one recorded thing-that-happened (one diary line, one bank transaction). E.g. "changed brand to Aurelia."
> - **Event log / event sourcing** = storing everything as an append-only list of events, and computing current state by replaying them. "Append-only" = you can only add to the end, never edit or delete past lines.
> - **Fold / replay** = the act of reading events top-to-bottom and building up the current state. (In the bank analogy: adding up all transactions to get the balance.)
> - **Commit** = deliberately marking "this is a saved version now" (like taking a photo/snapshot at this moment).
> - **Projection / read model** = a convenience summary computed from the diary, so we don't replay the whole thing every time we want to show your profile. It's a cache. If it's ever lost, we just rebuild it by replaying the diary.

### 6.4 The three magic powers this gives us (for free)

Because we keep the full diary instead of a sticky note:

1. **Rollback (undo to any point):** want Version 1 back? Just replay the diary up to "Committed as Version 1" and stop. The later lines still exist; you just didn't read them this time.
2. **Full history:** you can *see* how your taste evolved (v1 Libas → v2 Aurelia → …). Nothing is ever lost.
3. **Fork (copy someone's deck):** to copy Priya's deck into your account, we just *replay her diary into a fresh diary under your name.* You get an identical starting point with its own independent future. (More in Part 12.)

### 6.5 Small picture of the memory

```
   ┌──────────────────────── DATABASE ────────────────────────┐
   │                                                          │
   │  THE DIARY (truth) — append-only                         │
   │  ┌────────────────────────────────────────────────────┐  │
   │  │ events: who / what changed / when / which profile   │  │
   │  └────────────────────────────────────────────────────┘  │
   │                                                          │
   │  THE SUMMARY (convenience, rebuildable from the diary)   │
   │  ┌────────────────────────────────────────────────────┐  │
   │  │ current state of each profile & version, for fast   │  │
   │  │ display                                             │  │
   │  └────────────────────────────────────────────────────┘  │
   │                                                          │
   │  THE CATALOG (a sample of products, for our own          │
   │  calculations like "how many match?")                    │
   │                                                          │
   │  THE SOCIAL TABLES (which decks are public, stars, forks)│
   └──────────────────────────────────────────────────────────┘
```

That's the whole memory. One diary (the truth), one summary (for speed), plus product and social tables.

---

## Part 7 — DEEP DIVE: Brain 1, the Drift Engine (the star)

This is the single most important thing to understand and teach, because it's what makes Shelfie smart, and it's the first thing a judge will challenge. Take your time here.

### 7.1 The question it answers

When you're using "School Wear" and you start changing filters, Shelfie must decide:

> *"Is this the SAME shopping goal, just refined? Or a totally DIFFERENT goal?"*

- Change Libas → Aurelia: **same goal** (still cotton work kurtas), just refined → should become **Version 2**.
- Change kurtas → running shoes: **different goal entirely** → should become a **New Profile**, leaving "School Wear" untouched.

If we get this wrong, we either clutter one profile with unrelated stuff, or split one intent into pieces. So this decision matters.

### 7.2 The core idea: measure "how far did you move?"

We turn "how different is the new search from the saved profile" into a **number**. Small number = small change (a refinement). Big number = big change (a new goal). We call this number the **drift**.

Think of it like a **"difference score."** Two searches that are almost identical score near 0. Two searches with nothing in common score near 1 (the max).

### 7.3 But not all changes are equal — the weighting idea

Here's the insight that makes it clever. Changing the **category** (kurtas → shoes) is a *huge* signal you've changed goals. Changing the **colour** is a tiny signal. So we **weight** each type of change by how much it signals "new goal":

```
   How much does changing THIS field signal a NEW GOAL?
   ─────────────────────────────────────────────────────
   Category (kurta→shoes)  ████████████████████████  HUGE   (weight 0.60)
   Brand    (Libas→Aurelia)████                       small  (weight 0.12)
   Fabric                  ███                         small  (weight 0.10)
   Price                   ██                          tiny   (weight 0.08)
   Colour                  █                           tiny   (weight 0.05)
   Sleeve                  ▌                           tiny   (weight 0.03)
   Size                    ▌                           tiny   (weight 0.02)
   ─────────────────────────────────────────────────────
```

**Reading this:** if you change category, you add a *big* chunk (0.60) to the difference score. If you only change colour, you add a *tiny* chunk (0.05). So a category change almost always pushes the total over the "new goal" line, while a colour change never does. That matches human intuition — and you can *show* this bar chart to a judge as the explanation.

### 7.4 How we measure the difference within one field

For each field we need a small "how different are these two?" measure. Two easy cases:

**Sets of things (brand, colour, fabric):** we use **overlap**. If the old profile had colours {blue, green} and the new one has {blue, red}, they share "blue" but each has one unique. The more they overlap, the smaller the difference.

- Same exact set → difference 0.
- Completely different sets → difference 1.
- Half-overlapping → somewhere in between.

> This overlap measure has a name — **Jaccard distance** — but the idea is just "what fraction don't they share." You don't need the name to explain it: *"how much do the two lists NOT overlap."*

**Number ranges (price):** ₹0–1500 vs ₹0–1800 mostly overlap → small difference. ₹0–1500 vs ₹5000–8000 don't overlap at all → big difference.

### 7.5 Putting it together — the recipe

```
   drift = (category difference × 0.60)
         + (brand    difference × 0.12)
         + (fabric   difference × 0.10)
         + (price    difference × 0.08)
         + (colour   difference × 0.05)
         + ... etc
```

Add up each field's difference times its weight. That single total is the drift.

### 7.6 The decision — three simple bands

```
   drift = 0 ──────── 0.10 ──────────── 0.45 ──────────── 1.0
           │           │                 │                │
           │  UPDATE   │   NEW VERSION   │   NEW PROFILE   │
           │ in place  │  (recommended)  │  (suggested)    │
           │(tiny edit)│  (a refinement) │ (new goal)      │
```

Plus one override: **if the category jumped to a different section entirely (kurtas→shoes), skip straight to "New Profile"** no matter what the number says. That's the dominant rule.

### 7.7 Worked examples (memorize these — they're your demo)

| What Lakshmi did | Which fields changed | Rough drift | Decision |
|---|---|---|---|
| Libas → Aurelia | brand only | 0.12 | **New Version** |
| ₹1500 → ₹1800 | price a little | 0.016 | **Update in place** |
| +maroon colour, +Aurelia, +₹1800 | three small things | ~0.19 | **New Version** |
| kurtas → Nike running shoes | category jumped | (override) | **New Profile** |

### 7.8 Why this beats "just ask an AI"

A judge might say "why not let an AI decide?" Your answer:

> *"An AI would be a black box — it couldn't tell you WHY. Our method can print the exact reason: 'Category changed from Ethnic Wear to Footwear, that's the biggest new-goal signal, so we suggest a new profile.' It's transparent, it's fast, it never makes things up, and the user can trust it. We deliberately used a simple, explainable calculation instead of a mysterious model."*

**This "we chose explainable on purpose" is a strength, not a limitation. Say it proudly.**

---

## Part 8 — Brain 2, the Fuzzy Compiler (sentence → filters), explained simply

### 8.1 What it's for

Some things you want can't be clicked as filters. There's no Myntra checkbox for **"nothing flashy"** or **"something a teacher can wear."** The Fuzzy Compiler lets you *type a sentence* and turns it into real filters.

Example:
```
   You type:   "pure cotton kurtas under 1500 for school, nothing flashy"
                                │
                                ▼
   Compiler produces:  fabric = cotton
                       price  = 0 to 1500
                       occasion = workwear         (from "for school")
                       colour EXCLUDE neon, sequins (from "nothing flashy")
```

### 8.2 The danger, and how we make it safe

If we just let an AI freely invent filters, it might invent one that **doesn't exist** on Myntra — like `fabric = "breathable-luxe"` — and then you'd get zero results and a broken experience.

So we use a **two-step safety system**:

```
   STEP 1: AI SUGGESTS            STEP 2: WE CHECK EACH ONE
   ┌────────────────────┐         ┌──────────────────────────────┐
   │ AI reads sentence  │         │ Is "cotton" a real Myntra     │
   │ and proposes:      │────────▶│ fabric option? ✓ keep         │
   │  fabric = cotton   │         │ Is "breathable-luxe" real? ✗  │
   │  fabric = luxe     │         │ throw it away                 │
   │  colour ≠ neon     │         │ Is "neon" a real colour? ✓ keep│
   └────────────────────┘         └──────────────────────────────┘
                                            │
                                            ▼
                                   Only REAL, valid filters are applied
```

> **Teach it as:** *"The AI is the brainstormer; our checker is the bouncer. The AI throws out ideas, the bouncer only lets in the ones that are actually on Myntra's list. So we get creativity without ever breaking."*

### 8.3 The little dictionary

We keep a small hand-written **dictionary** of vague words → real filters. This is simple and editable:

```
   "flashy"     → remove neon, sequins, metallic
   "school/office/teacher" → occasion = workwear
   "summery / breathable"  → fabric = cotton or linen
   "cheap / sasta"         → price max = low end
   "premium"               → price min = high end
```

If the AI is switched off or unavailable, this dictionary alone still handles common words. **Nothing breaks** — the typing feature just becomes a bit simpler.

---

## Part 9 — Brain 3, the Coverage Advisor (the helpful warning), explained

### 9.1 What it does

Sometimes you pick so many filters that **almost nothing matches**. Normal sites just show you a sad empty page. Shelfie instead **warns you early and tells you exactly which filter to loosen**:

```
   ⚠ Only 6 products match this profile.
      Your combo of  pure cotton + hand-embroidered + under ₹800
      is very tight.
      Try:  [ raise price to ₹1200 → +38 items ]
            [ drop "hand-embroidered" → +120 items ]
```

### 9.2 How it works (simple)

For each filter, we ask a tiny "what if?": *"How many more products would match if we removed just this one filter?"* The filter that unlocks the most products is the one worth loosening. We count, we compare, we suggest. **It's just counting — no magic.**

> **Teach it as:** *"It's like a helper who says 'you asked for cotton AND hand-embroidered AND under ₹800 — that exact combo barely exists, but if you drop the embroidery, suddenly there are 120 options.' It turns a dead-end into a helpful nudge."*

This directly fights the "empty search results" problem that frustrates shoppers, especially in smaller cities where the catalog is thinner.

---

## Part 10 — FEATURE USER BOARDS (for teaching your teammates)

A **"user board"** here means: one feature told as a little story from the user's point of view, with the exact screens and what happens behind them. Read these aloud to teammates — each is self-contained.

Format of each board:
- **Who & why** (the human situation)
- **What they do** (the taps)
- **What they see** (the screen)
- **What happens behind the scenes** (one line)
- **Why it matters** (the point)

---

### BOARD 1 — Save a Shopping Profile  *(Feature C1)*

**Who & why:** Lakshmi, a schoolteacher, has just built the perfect cotton-kurta search and doesn't want to lose it.

**What they do:** After filtering, she opens the Shelfie panel and clicks **"Save current search as Profile,"** types "School Wear," clicks Save.

**What they see:**
```
Save as Shopping Profile
Name: [ School Wear ]     ✨ Suggested: "Cotton Workwear Kurtas"
This profile saves:
 • "kurta" · ₹0–1500 · Libas · cotton · 3/4 · XL · no neon
[ Make public ▢ ]   [ Save Profile ]
```

**Behind the scenes:** the Adapter reads her filters from the URL; the server writes a "Created profile" event in the diary.

**Why it matters:** the effort she spent is now permanent and reusable. **This is the whole product in one feature.**

---

### BOARD 2 — Reload a Profile  *(Feature C2)*

**Who & why:** It's next week; Lakshmi needs work kurtas again.

**What they do:** Opens Shelfie, clicks **"School Wear."**

**What they see:** the Myntra page instantly shows her exact saved shelf again — same filters, fresh stock.

**Behind the scenes:** server sends back the saved filters → Adapter rebuilds the Myntra URL → browser navigates there → Myntra renders the shelf.

**Why it matters:** zero re-work. One click replaces twelve. **This is the "aha" moment in the demo.**

---

### BOARD 3 — Unsaved Changes & the 3-Way Save  *(Feature C3)*

**Who & why:** With "School Wear" active, Lakshmi tries switching brand Libas → Aurelia to see other options.

**What they do:** She changes the filter. She hasn't decided to save yet.

**What they see:** the status bar turns amber: `✎ School Wear · v2 — Unsaved changes`. When she clicks Save:
```
You've changed "School Wear"
Changed: Brand Libas → Aurelia
ⓘ Looks like a refinement (same category).
● Save as New Version  (recommended)
○ Update this version
○ Save as a New Profile
[ Preview changes ]     [ Confirm ]
```

**Behind the scenes:** Shelfie noticed the current filters differ from the saved profile (the "dirty" state), and asked Brain 1 (Drift) which option to recommend.

**Why it matters:** it never nags her or overwrites silently. She stays in control; the system only *suggests*. This is the interaction that makes engineers trust the product.

> **Jargon decoded:** **"dirty state"** = a programmer's term for "you've made changes you haven't saved yet." Same as the dot on an unsaved file in any editor.

---

### BOARD 4 — Version Timeline & Rollback  *(Feature C4)*

**Who & why:** Lakshmi saved the Aurelia version (v2) but decides she preferred the original Libas one.

**What they do:** Opens the profile's timeline, clicks **Restore** on v1.

**What they see:**
```
School Wear
  ○ v1 · Libas · ₹1500 · cotton   [ Restore ]
  ● v2 · Aurelia · ₹1500 · cotton   (current)
```
After clicking Restore on v1, the Myntra shelf reverts to the Libas shelf.

**Behind the scenes:** server replays the diary up to "Committed v1" and rebuilds that state; the Aurelia history is NOT deleted — she can go forward again.

**Why it matters:** "refine forever, lose nothing." This is the payoff of the diary (event sourcing) approach.

---

### BOARD 5 — Multi-Persona on a Shared Account  *(Feature C6, the Bharat hook)*

**Who & why:** One Myntra account is shared by Amma, her daughter Divya, and son Arjun.

**What they do:** Amma taps the persona switcher, picks **Divya**.

**What they see:**
```
Shopping as: [ 👧 Divya ▾ ]
   Divya's profiles: College Fusion, Sneakers
   (Amma's "School Wear" is hidden — it's not Divya's)
```

**Behind the scenes:** switching persona just filters which profiles are shown; each persona's profiles are separate objects, so nothing blends.

**Why it matters:** on one shared phone/account, nobody's taste pollutes anyone else's. This solves the very real "65% of accounts are shared" problem Myntra itself has written about. **This is your strongest Bharat argument.**

---

### BOARD 6 — Preview / Dry-Run Diff  *(Amplifier A1)*

**Who & why:** Before saving the Aurelia version, Lakshmi wants to know what it changes.

**What they do:** Clicks **Preview changes** in the save box.

**What they see:**
```
Saving this version changes your shelf:
  + 240 products added (mostly Aurelia)
  − 60 products removed (Libas)
  = 312 total match
```

**Behind the scenes:** the server compares the old profile's matching products with the new one's, and shows the difference.

**Why it matters:** she *sees* the consequence before committing. It makes the abstract idea of "a version" concrete and visual — great on video.

---

### BOARD 7 — Coverage / Conflict Advisor  *(Amplifier A2)*

**Who & why:** Lakshmi over-filters and gets almost nothing.

**What they do:** Nothing — the warning appears on its own.

**What they see:**
```
⚠ Only 6 products match.
   pure cotton + hand-embroidered + under ₹800 is very tight.
   [ raise price → +38 ]   [ drop hand-embroidered → +120 ]
```

**Behind the scenes:** Brain 3 counts how many products each loosened filter would unlock, and suggests the best one.

**Why it matters:** turns a frustrating empty page into a helpful next step — especially important for thinner small-city catalogs.

---

### BOARD 8 — Type Your Intent (Fuzzy Compiler)  *(AI enhancement)*

**Who & why:** Lakshmi prefers typing to clicking filters.

**What they do:** Types *"pure cotton kurtas under 1500 for school, nothing flashy."*

**What they see:** Shelfie fills in the real filters and shows its work:
```
I set: cotton · ₹0–1500 · workwear · excluded neon, sequins
(from "nothing flashy" and "for school")
```

**Behind the scenes:** AI proposes filters → the "bouncer" keeps only real ones → they're applied and explained.

**Why it matters:** captures fuzzy human needs no checkbox can, without ever inventing fake filters. And she can edit what it chose (transparency).

---

### BOARD 9 — Behavioural Suggestion (opt-in)  *(Stretch S1)*

**Who & why:** Lakshmi keeps rebuilding the same search and hasn't thought to save it. She earlier switched the suggestion setting ON.

**What they do:** Nothing — Shelfie notices the repetition.

**What they see:**
```
You've searched cotton kurtas under ₹1500 three times this week —
save it as a profile?   [ Save ]   [ No thanks ]
```

**Behind the scenes:** the system spotted several near-identical searches (using the same difference measure from Brain 1) and offered a shortcut. It does **not** save anything on its own.

**Why it matters:** helpful without being creepy — it only *offers*, only if you opted in, and never profiles your taste silently. The on/off switch *is* the privacy promise.

---

### BOARD 10 — Publish, Discover, Star, Fork  *(Collaboration L1–L4)*

**Who & why:** Priya, a stylish teacher, made a great "Cotton Workwear" deck. Lakshmi wants it.

**What they do:** Priya flips her profile to **public**. Lakshmi opens **Discover**, sees it, clicks **Fork**.

**What they see:**
```
🔥 Discover
Cotton Workwear Kurtas · by @priya · ★412 · ⑃57 forks
[ ★ Star ]   [ ⑃ Fork to my profiles ]   [ View ]
```
After forking, Lakshmi has her *own* copy she can freely edit; Priya's stays untouched.

**Behind the scenes:** forking = replaying Priya's diary into a brand-new diary under Lakshmi's name. Separate copies, no shared state, no conflicts.

**Why it matters:** it's "GitHub for shopping" — shareable, forkable taste. It's a brand-new discovery surface, and the popular-but-poorly-stocked decks tell Myntra exactly what inventory to add. **This is the blue-ocean wow feature.**

> **Jargon decoded:**
> - **Fork** = make your own editable copy of someone's thing (borrowed from GitHub, where programmers fork each other's code). Their original is unaffected.
> - **Star** = a bookmark/like that also signals popularity.
> - **Discover feed** = a browsable list of public decks.

---

## Part 11 — How the pieces talk: one complete journey with every part labelled

Now that you understand each part, here's the *entire* system cooperating for one action — **"Lakshmi changes a filter and saves a new version."** Follow the numbers.

```
  ┌── BROWSER ─────────────────────────────────────────────────────────┐
  │                                                                     │
  │  Myntra page          ①  Lakshmi changes brand Libas→Aurelia        │
  │       │                   (Myntra updates its own URL)              │
  │       ▼                                                             │
  │  ADAPTER  ② reads new URL → clean list {brand:Aurelia,...}          │
  │       │                                                             │
  │       ▼                                                             │
  │  SIDE PANEL ③ compares to active profile → sees a difference →      │
  │       │        shows amber "Unsaved changes"                        │
  │       │     ④ Lakshmi clicks Save                                   │
  │       │        └─▶ asks server: "which option do you recommend?"    │
  └───────┼─────────────────────────────────────────────────────────────┘
          │ API call
          ▼
  ┌── SERVER ──────────────────────────────────────────────────────────┐
  │  ⑤ DRIFT ENGINE computes difference = 0.12 (brand only) →           │
  │       recommends "New Version" + reason "same category, refinement" │
  │  ⑥ answer sent back to the panel                                    │
  └───────┬─────────────────────────────────────────────────────────────┘
          │
          ▼  (Lakshmi picks "New Version", clicks Confirm)
  ┌── SERVER ──────────────────────────────────────────────────────────┐
  │  ⑦ writes 2 diary events: "Changed brand" + "Committed Version 2"   │
  │  ⑧ updates the summary table so the UI shows v2 quickly             │
  └───────┬─────────────────────────────────────────────────────────────┘
          │
          ▼
  ┌── BROWSER ─────────────────────────────────────────────────────────┐
  │  ⑨ side panel now shows: ✓ School Wear · v2                         │
  └─────────────────────────────────────────────────────────────────────┘
```

If you can walk a teammate through these nine steps out loud, you understand the whole system. That's your teaching goal.

---

## Part 12 — Fork explained visually (because it surprises people)

People assume "copy a deck" is complicated. With the diary approach it's beautifully simple. Here it is:

```
   PRIYA'S DIARY (public deck)          LAKSHMI'S NEW DIARY (her fork)
   ────────────────────────────         ────────────────────────────────
   1 Created (cotton, ₹1500, Libas)     1 ForkedFrom Priya's v2     ← marker
   2 Committed v1                  ──▶  2 Created (cotton,₹1500,Aurelia) ← copy of
   3 Changed brand → Aurelia                                           Priya's state
   4 Committed v2   ◀── fork point       3 Committed v1  (= Priya's v2)
   5 Changed price → ₹1800                                            
     (Priya keeps editing…)              (Lakshmi now edits her OWN copy,
                                          Priya's diary is untouched)
```

**In words:** we look at Priya's deck at the moment Lakshmi forked (her v2), take a snapshot of that state, and start a **fresh diary** for Lakshmi beginning from that snapshot. From then on they're two independent diaries. **No shared page, so no "two people editing at once" problem** — which is exactly why we can build fork in the hackathon but leave *live co-editing* for later.

---

## Part 13 — What we are NOT building (and how to say why)

Teach your teammates these boundaries so nobody over-promises to a judge:

| We are NOT building | Why (simple reason) |
|---|---|
| Two people editing the SAME deck live | That's the "two cooks, one recipe card, both scribbling at once" problem — needs special conflict-handling tech. Fork (separate copies) gives the sharing value without it. |
| Rebuilding Myntra's search/catalog | Pointless and impossible in 3 days. We ride on top of the real Myntra. |
| Training our own AI model | Our drift engine is deliberately a simple, explainable calculation — that's a feature, not a gap. |
| Guessing your taste automatically | We only save what you explicitly tell us to. The one "watching" feature is opt-in and only *suggests*. |

Saying "we deliberately scoped these out, and here's why" makes you look **more** competent, not less. Judges respect teams that know their limits.

---

## Part 14 — The five sentences that summarize everything

If a teammate remembers nothing else, these five sentences carry the whole idea:

1. **"We save the *route*, not just the *destination*"** — the filter-combo that found the products, not only the products.
2. **"A profile is a shopping intent; versions are how that intent evolved"** — one goal, a timeline of refinements.
3. **"We store changes like a bank stores transactions"** — an append-only diary, so nothing is ever lost and you can roll back to any point.
4. **"We measure how far you drifted to decide new-version vs new-goal — and we can always show the reason"** — transparent, not a black box.
5. **"It runs on the real Myntra as a browser add-on, and it's forkable like GitHub"** — shippable today, and a brand-new social discovery surface.

---

*End. If any single part still feels fuzzy when you teach it, that part needs one more example — not more words. Reach for a real-life analogy (bank account, recipe card, notebook) every time.*
