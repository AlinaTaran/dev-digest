# server — INSIGHTS

Append-only log of decisions, gotchas discovered, and lessons for the API package.
Newest first. Capture what wasn't obvious from the code — the "why" behind a choice,
or a trap someone hit — so the next person (or agent) doesn't relearn it.

## What Works

- **`ReviewOutcome.costUsd` is the actual OpenRouter charge** — `reviewer-core/src/llm/openrouter.ts` extracts `usage.cost` from the API response and accumulates it across chunks. Always prefer this over `priceBook.estimate()` which uses static list prices and can be 15–35% off from the actual billed amount due to dynamic provider routing.

## What Doesn't Work

- **`priceBook.estimate()` for displayed cost** — Uses `/models` list price; OpenRouter routes dynamically (DigitalOcean, Cloudflare, Alibaba) with different prices per provider, plus caching discounts. Don't use as a display value — use only as a fallback when `costUsd` is null (old rows before the `cost_usd` DB column was added).

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- **API serving stale code despite edits → check for duplicate `tsx watch src/server.ts` processes.** Multiple `pnpm dev` instances can accumulate; only one binds `:3001` and the others' children may keep serving OLD code (or a killed watcher leaves an orphaned child on the port). Symptom: a route change has no effect even though the file on disk is correct. Fix: `lsof -nP -iTCP:3001 -sTCP:LISTEN` to find the real owner, `kill` all `tsx watch` parents + the listening child, confirm `:3001` is free, then start one fresh `pnpm dev`.

## Codebase Patterns

- **`ReviewRepository` (repository.ts) wraps `run.repo.ts`** — both files define `completeAgentRun`. When adding a new field to the values type, update BOTH files: `repository/run.repo.ts` (the implementation) and `repository.ts` (the wrapper used by `run-executor.ts`).

- **`GET /repos/:id/pulls` returns `Promise<PrMeta[]>` with NO response Zod schema** (only `params: IdParams`). Adding a field to `PrMeta` is therefore a pure type change — the object is serialized as-is, nothing strips unknown keys. The list popover's `latest_findings` (full `Finding[]`) is built in the SAME findings query that computes the severity counts (`fullFindingsByReview` alongside `findingsByReview`), so previewing findings on the list needs no extra request. `severity`/`category`/`kind` are `text` columns → cast to the `Finding` enum types (`as Finding['severity']`).

- **PR-list FINDINGS + SCORE aggregate across the latest review PER AGENT, not the single newest review** (`currentReviewIdsByPr` keyed by `prId:agentId`, newest-first → first seen wins). Re-runs create new `reviews` rows, so a PR that one agent re-ran clean while another still flags issues must still show those issues — "current open findings" semantics (product-confirmed: clean latest reviews ⇒ show "—"). PR `score` is the MIN across those current per-agent reviews (worst agent), so the score stays coherent with the findings shown. The `/pulls/:id/reviews` endpoint, by contrast, returns ALL review rows (full history) — so the detail page shows superseded findings the list intentionally omits.

- **The PR-list aggregation (score + findings + cumulative cost) lives in `modules/pulls/review-meta.repo.ts`, NOT inline in `routes.ts`.** `loadPrReviewMeta(db, priceBook, prIds)` runs the 3 IN-queries + JS grouping and returns `Map<prId, PrReviewMeta>`; the route handler just maps rows through it. Keep new list-aggregation logic there — `routes.ts` is intentionally thin (per `server/CLAUDE.md`: routes thin, data access in repositories). The route still does the GitHub sync + base PR select directly; that's pre-existing.

- **Run-cost fallback is centralized in `PriceBook.resolve(costUsd, model, tokensIn, tokensOut)`** — returns the actual API cost when stored, else `estimate(...)` for pre-migration rows, else null. Don't re-inline the `costUsd ?? estimate(...)` ternary; the list (`review-meta.repo.ts`), run history (`reviews/service.listRuns`), and trace (`reviews/service.getRunTrace`) all go through `resolve` so they stay consistent.

## Session Notes

### 2026-07-01 — Best-practices cleanup of the cost/findings feature
- Extracted ~150 lines of list-aggregation out of `pulls/routes.ts` into `pulls/review-meta.repo.ts` (`loadPrReviewMeta`) — pure move, behavior preserved (verified by `contracts.test.ts` + pulls/reviews `.it.test.ts`, all green).
- Added `PriceBook.resolve(...)` and routed the 3 duplicated cost-fallback sites through it (DRY).
- Client: dropped a `findings!` non-null assertion in `RunHistory` (narrow to a `findingsList` const), and removed a pass-through `formatCost` re-export in `RunTraceDrawer/helpers.ts` (`TraceBody` now imports from `@/lib/format` directly).

### 2026-06-30 — Run Cost Badge: accuracy + format fixes
- Added `cost_usd` (`DOUBLE PRECISION`) column to `agent_runs` via migration `0010_polite_nico_minoru.sql`.
- `run-executor.ts` now captures `outcome.costUsd` (actual OpenRouter API cost) and stores it via `completeAgentRun` and in the run trace JSONB stats.
- `service.listRuns` prefers stored DB value, falls back to `priceBook.estimate()` for rows pre-migration.
- `service.getRunTrace` simplified — returns trace as-is (no re-estimation override).
- `formatCost` fixed to show 3 significant figures for sub-cent amounts via `Math.log10`-based `dp` calculation.

### 2026-06-30 — INSIGHTS log started
**Decision:** Track per-package learnings here, referenced from `server/CLAUDE.md`.
**Why:** `CLAUDE.md` is a thin map; durable history belongs in a lazy-loaded file.
**Consequence:** Add an entry whenever a non-obvious decision or gotcha lands.

## Open Questions
