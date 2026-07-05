# reviewer-core — design rationale

Why the review engine is shaped the way it is. For the *what* (commands, conventions,
gotchas) see `reviewer-core/AGENTS.md`; for behavior contracts see `reviewer-core/specs/`.

## The engine is pure

`reviewPullRequest` (`src/review/run.ts`) does **no I/O except the injected LLM call** —
no DB, GitHub, filesystem, memory retrieval, intent resolution, or persistence. Those
stay in the caller:

- the **studio server** persists runs + streams SSE;
- the **CI runner** posts to GitHub + writes an artifact.

The provider is passed in via `ReviewInput.llm` (`LLMProvider`). This is what makes the
engine hermetically testable (`npm test` needs no DB / network) and lets the same code
run in two very different hosts. Skill bodies, memory, and specs arrive as **resolved
strings**, not slugs — the caller turns `AgentManifest` slugs into bodies (DB in the
studio, fs in the runner) so the engine never reaches for them itself.

## Single-pass vs map-reduce

`selectMode` (`src/review/run.ts`) picks the strategy:

- `single-pass` — one LLM call over the whole diff.
- `map-reduce` — one call per changed file, then `reduceReviews` merges the partials.
- `auto` (default) — map-reduce **only when the diff is both large AND multi-file**
  (`totalLines > mapThresholdLines (400)` **and** `files.length > 1`); otherwise a single
  call. A large single-file diff stays single-pass on purpose — splitting one file buys
  nothing.

`reduceReviews` (`src/review/reduce.ts`) concatenates findings, takes the **worst**
verdict (`request_changes` > `comment` > `approve`), and means the partial scores — but
the merged score is then **thrown away and recomputed** (see below).

## Deterministic score, not the model's

The model's self-reported `score` is **ignored**. `scoreFromFindings` recomputes a 0–100
score from the *grounded* findings using fixed penalties:

| Severity | Penalty |
|---|---|
| CRITICAL | −35 |
| WARNING  | −12 |
| SUGGESTION | −3 |

Rationale (`src/review/reduce.ts`): the self-reported number has no anchor and drifts
wildly between models — a cheap model can "approve" with zero findings yet emit a score of
10. Deriving the score from findings guarantees the number on screen can never contradict
the findings list beneath it, and matches how the review *event* severity is computed in
`output/to-review.ts`.

## Citation grounding — the mechanical gate

After reduce, every finding passes through `groundFindings` (`src/grounding.ts`):

- A normal diff-finding is **kept only if its `[start_line, end_line]` intersects a real
  hunk** for the same file (new-side line numbers). If it doesn't, the model hallucinated
  the location and the finding is **dropped**.
- **Full-file scanners** (`kind` ∈ `secret_leak`, `lethal_trifecta`, `phantom`, `hook`)
  aren't tied to a hunk — they only require the file to be present in the diff.
- A finding whose `file` isn't in the diff at all is always dropped.

Dropped findings are returned with reasons (`GroundingResult.dropped`) and emitted as
progress events — we never drop silently. The final score is derived from the **kept** set,
so score, findings, and the deterministic event always agree.

## Prompt-injection hardening

External content is **data, never instructions**. `assemblePrompt` (`src/prompt.ts`):

- appends a single fixed `INJECTION_GUARD` to every agent system prompt — so it runs on
  every path (studio + CI), instead of pattern-matching untrusted text downstream (which
  only ever catches one phrasing / language);
- wraps all repo/author-derived content (`diff`, PR description, specs, repo map, callers)
  in `<untrusted source="…">…</untrusted>` via `wrapUntrusted`, which also neutralizes any
  attempt to close the delimiter early (`</untrusted>` → `<\/untrusted>`);
- caps the PR description at `MAX_PR_DESCRIPTION_CHARS` (4000) so a huge author body can't
  blow the token budget.

The guard explicitly tells the model that claims like "test fixture / demo / do not ship /
ignore this" — **in any language** — never waive a real finding.

## Structured output out of band

The `Review` shape is enforced via a strict JSON Schema (the Zod `Review` contract passed
to `llm.completeStructured`), **not** described in prompt prose. Reprompt retries are
bounded by `DEFAULT_REVIEW_MAX_RETRIES` (2). The prompt describes *what to look for*; the
*shape* is the provider's problem.
