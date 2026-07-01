# e2e — INSIGHTS

Append-only log of decisions, gotchas discovered, and lessons for the e2e suite.
Newest first. Capture what wasn't obvious from the code — the "why" behind a choice,
or a trap someone hit — so the next person (or agent) doesn't relearn it.

## What Works

- **Flows run in lexical filename order** (`run.ts` sorts `specs/*.flow.json`). Prefix new
  flows (`01-`, `02-`, …) to control order — there's no other sequencing mechanism, and
  later flows can rely on earlier ones having navigated (one shared session, below).

## What Doesn't Work

- **A non-zero exit aborts the whole flow, not just the step** (`runFlow` breaks on the
  first failure). This includes a `wait --text` / `wait --url` whose condition never holds.
  So one flaky `wait` kills every subsequent step — use `wait` for synchronization (never
  sleeps), and assert on conditions that are actually guaranteed by the seed.

## Codebase Patterns

- **All commands in a run share ONE browser session** — the agent-browser daemon keeps the
  page between invocations, and the session is torn down once in a `finally`
  (`ab(["close"])`). State leaks between steps *by design*; a flow is an ordered script, not
  isolated test cases. Don't assume a fresh page per step.

## Tool & Library Notes

- **`{BASE}` is substituted by `resolveArgs`** from `E2E_BASE_URL` (default
  `http://localhost:3000`); `AGENT_BROWSER_BIN` and `E2E_STEP_TIMEOUT` (default 60s) are the
  other knobs. `assert.stdoutIncludes` is a substring check on the command's stdout layered
  *on top of* the exit-code check — use it to verify rendered text, not just navigation.

## Recurring Errors & Fixes

- **Flow fails on a `wait --text` for seeded content** → the DB wasn't freshly seeded.
  Flows assume specific fixtures (e.g. `acme/payments-api` PR #482 as the first repo). Fix:
  re-run `./scripts/dev.sh` to reseed before the suite.

## Session Notes

### 2026-06-30 — Read runner while filling docs/specs
- Wrote `docs/writing-flows.md` from `run.ts` + a sample flow. Non-obvious bits kept above:
  shared single session, first-failure aborts the flow, lexical ordering, seed assumptions.

### 2026-06-30 — INSIGHTS log started
**Decision:** Track per-package learnings here, referenced from `e2e/CLAUDE.md`.
**Why:** `CLAUDE.md` is a thin map; durable history belongs in a lazy-loaded file.
**Consequence:** Add an entry whenever a non-obvious decision or gotcha lands.

## Open Questions
