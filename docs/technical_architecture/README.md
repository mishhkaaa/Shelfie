# ShopDNA — Technical documentation set

Deep-dive engineering documentation, one file per sub-system. Each file assumes you've read `00` first (the philosophy that everything else's trade-offs are argued against). After that, files are independent — read whichever sub-system you need to defend or build next.

| File | Sub-system | The one hard question it answers |
|---|---|---|
| `00-architecture-philosophy.md` | Overall consistency model | Why event sourcing, and why it doesn't need distributed-systems infrastructure at this scale |
| `01-adapter-layer.md` | Reading/writing Myntra's state | How do you reliably read filter state from a single-page app you don't control? |
| `02-event-sourcing-engine.md` | The event log / database core | How is concurrency handled, and what bounds the cost of "replay everything"? |
| `03-drift-engine.md` | Version vs. new-profile decision | Why is this a distance metric and not a classifier, and where do the weights come from? |
| `04-fuzzy-compiler.md` | Sentence → filters | How do you stop an LLM from inventing a filter that doesn't exist? |
| `05-collaboration-engine.md` | Fork / star / discover | Why doesn't forking need the hard distributed-merge problem real version control has? |
| `06-coverage-diff-engine.md` | "Too few results" advisor + dry-run diff | How do you keep re-querying the catalog cheap as it grows? |
| `07-database-schema.md` | Full schema + ERD | Why Postgres, and what does each index actually protect? |
| `08-api-contracts.md` | Endpoint contracts | How do you make retries safe over an unreliable network? |
| `09-aws-infrastructure.md` | Deployment | Why EC2 over Lambda, why RDS over self-hosted, all within AWS Free Tier |
| `10-end-to-end-pipelines.md` | Full request lifecycles | How do all the sub-systems above cooperate for one user action? |

## How to use this set

- **Preparing for jury Q&A**: read `10` first — it shows exactly which document to cite for any given step of a demo action, then go deep on whichever file the question is actually about.
- **Starting the build**: read `07` (schema) and `02` (event sourcing) first — they're the foundation everything else is built on.
- **Explaining to a teammate who wants the "why," not just the "what"**: each file's opening section states the problem being solved before naming the mechanism — read that first paragraph even if you skip the rest.
