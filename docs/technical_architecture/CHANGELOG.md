# CHANGELOG

## v2 — revised after live-site testing and Groq API verification

Two files changed materially. Everything else in the doc set (`00`, `02`, `03`, `05`–`10`) is unaffected and still accurate as written.

---

### `01-adapter-layer.md` — primary read signal changed

**What changed**: the primary mechanism for reading Myntra's applied filters changed from **parsing the browser address bar** to **intercepting the search-gateway network request** (`gateway/v4/search/{category}?f=...`).

**Why**: live testing against the real site showed the address bar does not reliably carry the full filter state on every page type — the extension's own self-test correctly caught this and degraded safely (exactly as the original fail-fast design intended), which is what surfaced the need for this change. The gateway request, by contrast, necessarily carries the complete, structured filter state, because the backend cannot return correct results without it.

**New technical requirements this introduces**:
- Main-world script injection (`chrome.scripting.executeScript` with `world: "MAIN"`) to patch `fetch`/`XMLHttpRequest` inside the page's real JS context — an isolated-world content script cannot do this.
- A request allowlist (`host === myntra.com && path matches /gateway/v4/search/*`) to filter out the large volume of unrelated tracking/analytics traffic observed on a real page load.
- A concrete, now-known facet grammar: colon-delimited `attribute:value` segments, comma-delimited multi-values, compound values (e.g. a colour name plus a hex suffix), and double-URL-encoding of the `f` parameter's contents.

**Still open, flagged as Day-0 experiments, not yet resolved**:
- Whether a cold page load honors this same grammar in the visible URL (which would solve the *write* path — reloading a saved profile — the same way originally planned, just with the correct grammar).
- Whether the gateway endpoint can be called directly by the extension (bypassing Myntra's own page rendering entirely) to get real catalog counts for the Coverage Advisor and dry-run diff, instead of the synthetic proxy catalog — dependent on unverified cookie/CORS behavior.

**Explicitly rejected**: a VLM/vision-based agentic loop as an alternative read mechanism. Reasoning: higher latency (seconds, not milliseconds), higher cost (continuous screenshot capture and inference), does not solve the write path any more than URL-reading did, and reintroduces a harder-to-validate version of the exact hallucination-risk problem the fuzzy compiler already solves for text. Rejected on technical grounds, not availability — Groq does support vision-capable models, so this wasn't ruled out by tooling constraints.

---

### `04-fuzzy-compiler.md` — corrected a claim about hosted-API constrained decoding

**What changed**: the original document stated that true constrained decoding requires local model-weight access and is unavailable via a hosted API, and treated "LLM proposes, validator checks afterward" as the practical ceiling. This was inaccurate for Groq specifically and has been corrected.

**Why**: Groq serves open-weight models on hardware it controls (the LPU), and its Structured Outputs API with `strict: true` performs genuine token-level constrained decoding against a supplied JSON Schema — not prompt-engineered formatting. Populating each field's schema with an `enum` drawn from the live catalog taxonomy makes it structurally impossible for the model to emit a value outside that set, for any field expressible as a flat enum.

**What did not change**: the deterministic validator is retained as a second, independent line of defense — it catches schema staleness (the enum list is generated at request time and could lag a catalog update) and any cross-field constraint that a flat per-field enum can't express (e.g. "this size range is only valid for this category"). The system remains "two independent lines of defense," not "one perfect mechanism replacing the other."

**Also updated**: the latency estimate, from a generic "500ms–1.5s" to citing Groq's LPU-driven throughput (900+ tokens/sec on small models) as the specific reason "the compiler must feel instant" is achievable in practice, not just aspirational.

---

## Net effect on the rest of the doc set

- `06-coverage-diff-engine.md`'s synthetic-proxy-catalog approach is unchanged as the baseline plan, but is now flagged (from `01`) as potentially upgradable to real Myntra catalog data if the direct-gateway-call experiment succeeds. Not rewritten, since this is an open experiment, not a confirmed capability.
- `00-architecture-philosophy.md`, `02-event-sourcing-engine.md`, `03-drift-engine.md`, `05-collaboration-engine.md`, `07-database-schema.md`, `08-api-contracts.md`, `09-aws-infrastructure.md`, `10-end-to-end-pipelines.md` — no changes. Their reasoning does not depend on which specific signal the Adapter reads or which specific constrained-decoding mechanism the compiler uses.
