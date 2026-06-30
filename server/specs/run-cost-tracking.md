# server — run cost & findings spec

Behavior contract for the run-cost / PR-list aggregation work. Read this before changing
how cost or per-PR severity counts are computed. Architecture context:
`server/docs/architecture.md`.

## Source of truth for cost

Two sources, in priority order:

1. **Actual API cost** — `agent_runs.cost_usd` (`double precision`, migration
   `0010_polite_nico_minoru.sql`). Captured from the OpenRouter response
   (`ReviewOutcome.costUsd`) in `run-executor.ts` and stored via `completeAgentRun`. It is
   the real billed amount, which can differ 15–35% from list price due to dynamic provider
   routing and caching discounts.
2. **Estimate fallback** — `container.priceBook.estimate(model, tokensIn, tokensOut)`,
   used **only** when the stored value is `null` (runs created before the column existed,
   or failed/cancelled runs).

Rule: `cost_usd` on a run is `stored value ?? estimate(...) ?? null`. Never overwrite a
stored actual cost with an estimate.

## Where it's applied (services, on read)

- **`ReviewService.listRuns`** — maps each run: `cost_usd = r.cost_usd ?? (model & tokens
  present ? priceBook.estimate(...) : null)`.
- **`ReviewService.getRunTrace`** — fetches the trace and `getRunCostUsd(runId)` in
  parallel; the trace's `stats.cost_usd = dbCostUsd ?? estimate(model, tokens_in,
  tokens_out)`.
- **Repository** — `run.repo.ts` writes `cost_usd: run.costUsd ?? null` on completion and
  exposes `getRunCostUsd(db, runId)` to read the stored column back.

## PR-list aggregation (`pulls/routes.ts`)

For each PR in the list, computed on read (no FK denormalization; the list is small, so
`IN`-queries + JS grouping are cheap):

- **SCORE** — the latest review's score per PR.
- **FINDINGS** — severity counts (`{ CRITICAL, WARNING, SUGGESTION }`) from that latest
  review's findings; `null` before the first review.
- **COST** — cumulative cost across **all** completed runs of the PR (sum of stored
  `cost_usd`, falling back to `estimate(...)` per run where null).

## Contract shape (`@devdigest/shared`)

The PR-list item gains:

```ts
cost_usd: z.number().nullish(),          // cumulative; null when no priced run exists
findings: z.object({
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
}).nullish(),                            // null before first review
```

The run/trace shapes gain `cost_usd: z.number().nullable()`.

## Display (client)

`formatCost` renders sub-cent amounts with **3 significant figures** (so `$0.000717`
stays meaningful), and strips trailing zeros only in the `$0.01–$0.99` range. See
`client/specs/pr-list-cost-and-severity.md`.

## Invariants

- A displayed cost is the actual billed amount whenever it's known; the estimate is a
  fallback, never a default.
- Findings counts shown in the list always reflect the **latest** review, matching the
  count shown on the PR detail page.
