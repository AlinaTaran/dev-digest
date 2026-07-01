# reviewer-core — engine behavior spec

Behavior contract for `reviewPullRequest` (`src/review/run.ts`). Read this before changing
engine behavior; rationale lives in `reviewer-core/docs/design.md`.

## Inputs (`ReviewInput`)

| Field | Trust | Notes |
|---|---|---|
| `systemPrompt` | trusted | agent's system prompt; `INJECTION_GUARD` is appended automatically |
| `model` | — | id understood by the injected provider |
| `diff` | untrusted | parsed `UnifiedDiff`; hunks carry new-side line numbers |
| `llm` | — | injected `LLMProvider` (OpenRouter in CI, OpenAI/Anthropic in studio) |
| `strategy` | — | `auto` (default) \| `single-pass` \| `map-reduce` |
| `skills` / `memory` | resolved strings | NOT slugs — caller resolves bodies |
| `specs` / `callers` / `repoMap` / `prDescription` | untrusted | delimiter-wrapped; omitted when empty |
| `maxRetries` | — | structured-output reprompt budget (default 2) |
| `mapThresholdLines` | — | map-reduce line threshold (default 400) |
| `sessionId` | — | forwarded on every call → one OpenRouter session per review |
| `onEvent` / `checkCancelled` | — | progress sink / cancellation checkpoint (throws to abort) |

## Pipeline

```
assemblePrompt → [single-pass | map-reduce per file] → reduceReviews → groundFindings → scoreFromFindings
```

1. **Mode selection** (`selectMode`):
   - `single-pass` → always one call.
   - `map-reduce` → one call per file **iff** `files.length > 1`, else single-pass.
   - `auto` → map-reduce **iff** `totalLines > threshold` **AND** `files.length > 1`.
2. **Per chunk**: assemble prompt, call `llm.completeStructured<Review>` with the `Review`
   JSON Schema; accumulate `tokensIn`, `tokensOut`, `costUsd`. `costUsd` becomes `null` if
   any chunk reports `null` (don't sum partial-unknown costs).
   - `checkCancelled()` is called **before** each (expensive) LLM call.
3. **Reduce** (`reduceReviews`): concat findings; worst verdict wins
   (`request_changes` > `comment` > `approve`); summaries joined.
4. **Grounding gate** (`groundFindings`): drop findings not intersecting a real hunk
   (full-file `kind`s only need the file present). Dropped findings are reported, never
   silent.
5. **Score** (`scoreFromFindings`): from the **kept** findings only —
   CRITICAL −35 / WARNING −12 / SUGGESTION −3, clamped to `[0, 100]`.

## Output (`ReviewOutcome`)

`review` (reduced + grounded, score recomputed), `grounding` summary string
(e.g. `"3/4 passed"`), `dropped` (with reasons), `mode`, `assembly` (for the trace),
`chunks` labels, `tokensIn`, `tokensOut`, `costUsd`, joined `raw`.

## Invariants

- The score is **always** derived from grounded findings — never the model's self-score,
  never the pre-grounding set.
- A finding that survives output is guaranteed to cite a `file:line` present in the diff.
- The engine emits no I/O side effects beyond `input.llm` and `input.onEvent`.
- Adding a new finding `kind` that is full-file (not hunk-bound) requires adding it to
  `FULL_FILE_KINDS` in `grounding.ts`, or it will be dropped.
