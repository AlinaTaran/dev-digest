# reviewer-core — INSIGHTS

Append-only log of decisions, gotchas discovered, and lessons for the review engine.
Newest first. Capture what wasn't obvious from the code — the "why" behind a choice,
or a trap someone hit — so the next person (or agent) doesn't relearn it.

## What Works

- **`auto` map-reduce requires BOTH large AND multi-file** (`selectMode`, `review/run.ts`).
  A large *single-file* diff deliberately stays single-pass — splitting one file into one
  chunk buys nothing and just adds a reduce step. Only `totalLines > mapThresholdLines`
  (400) **and** `files.length > 1` flips to map-reduce.

## What Doesn't Work

- **Don't trust `reduceReviews`'s `score`.** It computes a mean of partial scores, but
  `reviewPullRequest` immediately **discards** it and recomputes via `scoreFromFindings` on
  the *grounded* findings. If you read a score off the reduce step you'll get a number that
  never reaches the UI. The only authoritative score is post-grounding.

## Codebase Patterns

- **A new full-file finding `kind` must be added to `FULL_FILE_KINDS` in `grounding.ts`**,
  or the hunk-intersection gate will silently drop it (full-file scanners aren't tied to a
  diff hunk; they only require the file to be present). Forgetting this = the scanner runs
  but its findings never survive grounding.
- **`costUsd` is null-poisoning by design** (`review/run.ts`): the per-chunk accumulator
  becomes `null` the moment *any* chunk reports `null`, so a partially-unknown cost is
  reported as unknown rather than a misleading partial sum. Don't "fix" this to sum the
  known chunks.

## Tool & Library Notes

- **Always route untrusted content through `wrapUntrusted` (`prompt.ts`)** — it escapes any
  `</untrusted>` in the payload to `<\/untrusted>` so author/repo text can't close our
  delimiter and break out into instructions. Never string-concat raw external content into
  the prompt; add a new `wrapUntrusted('label', …)` section in `assemblePrompt` instead.

## Recurring Errors & Fixes

## Session Notes

### 2026-06-30 — Read engine while filling docs/specs
- Wrote `docs/design.md` + `specs/engine-behavior.md` from the source. Non-obvious bits
  worth keeping: reduce-score is thrown away (see What Doesn't Work), `FULL_FILE_KINDS`
  gating, `costUsd` null-poisoning, `wrapUntrusted` delimiter escaping. None of these are
  visible from `CLAUDE.md` alone.

### 2026-06-30 — INSIGHTS log started
**Decision:** Track per-package learnings here, referenced from `reviewer-core/CLAUDE.md`.
**Why:** `CLAUDE.md` is a thin map; durable history belongs in a lazy-loaded file.
**Consequence:** Add an entry whenever a non-obvious decision or gotcha lands.

## Open Questions
