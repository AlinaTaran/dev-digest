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

- **2026-10-25 — "Invalid response body while trying to fetch https://openrouter.ai/api/v1/chat/completions: read ECONNRESET" fails the run with NO retry.** OpenRouter returned `200` headers, then the TCP connection reset while the body was being read (OpenRouter holds the response open while the upstream model works; an upstream drop kills it mid-body). The `openai` SDK (4.104) only retries inside `makeRequest` — connection failure before headers, 429, 5xx (`node_modules/openai/core.js` ~327–339); the body is parsed later in `defaultParseResponse` (`core.js` ~49), outside the retry loop, so `maxRetries` in `llm/openrouter.ts` doesn't help. The server's `withRetry` (which does treat `ECONNRESET` as retryable) wraps only the server-side OpenAI/Anthropic adapters, not `OpenRouterProvider`. Seen since 2026-06-30, mostly on big single-pass prompts (100 changed files). Fix (not yet applied): retry body-read `FetchError`s (`code: 'ECONNRESET'` / `type: 'system'`) around `chat.completions.create` in `completeStructured`.
- **2026-10-25 — fix applied for the ECONNRESET body-read failure above.** `src/llm/transient.ts` adds `isTransientTransportError` (code/`cause.code` in ECONNRESET/ETIMEDOUT/EPIPE/ECONNREFUSED/UND_ERR_SOCKET, `FetchError` type `system`, or message `Invalid response body…`/`terminated`/`socket hang up`; never 4xx `status` or `AbortError`) and `withTransportRetry` (exponential backoff + equal jitter, default 2 retries, injectable `sleep`/`random`). `OpenRouterProvider` wraps only the `chat.completions.create` call with it (configurable via `OpenRouterProviderOptions.transportRetry`), INSIDE the parse-repair `attempt` loop, so a failed transport try consumes no tokens and never bumps `attempts`. Gotcha: hoisting the request into a const widens it to the streaming overload — type it `OpenAI.Chat.ChatCompletionCreateParamsNonStreaming` or `res.usage` stops typechecking. Tests: `test/transient.test.ts`.

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

- **Same agent + same PR → materially different verdicts across runs (2026-10-19).** Security Reviewer on `AlinaTaran/dev-digest` PR #3: run 1 → `request_changes`, score 6 (2 CRITICAL: no rate limit on `GET /pulls/:id/intent`, "no auth" on recompute POST + 2 WARNING); run `3ff83d3e…` → `comment`, score 73 (0 CRITICAL; the rate-limit finding downgraded to WARNING, the auth finding gone entirely). Both scores match the deterministic formula (100−2·35−2·12=6; 100−2·12−3=73), so the formula is fine — the swing is in which findings/severities the model emits. A single CRITICAL flips the verdict, so the gate is only as stable as the model's severity call. Open: pin temperature / sample N runs and keep findings that recur / add severity rubric examples to the Security prompt — before using a single run's verdict as a merge blocker.
