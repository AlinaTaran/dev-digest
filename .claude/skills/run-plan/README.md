# run-plan — skill reference

Meta-documentation for the `/run-plan` command: where it sits in the Spec Driven Development
flow, what it calls, and why it is shaped this way.

## Files

- **`SKILL.md`** — the orchestrator instructions (loaded on `/run-plan`).
- **`tile.json`** — package metadata.
- **`README.md`** — this file.

## Where it sits

```
spec-creator (manual chat) → approve spec
  → implementation-planner (manual chat) → approve plan
    → /run-plan plan:docs/plans/<feature>.md   ← this skill, fully autonomous
      → pr-self-review → commit / PR (by the user)
```

## Usage

```
/run-plan plan:docs/plans/<feature>.md [mode:single|multi] [max-fix:N]
```

| Arg | Default |
|---|---|
| `plan:` | required |
| `mode:` | the plan's `Execution mode` |
| `max-fix:` | `3` |

## What it does

1. Reads the plan → tasks, DAG (`Depends-on`), Owned paths, execution mode; records a git
   baseline so pre-existing WIP is never touched.
2. `implementer` ×N — multi-agent in DAG waves over disjoint Owned paths (or one implementer in
   single mode); each self-verifies with targeted tests + filtered typecheck.
3. `architecture-reviewer` ∥ `pr-self-review` ∥ `plan-verifier` — parallel. Architecture
   findings come only from architecture-reviewer (pr-self-review runs with its
   `onion-architecture` / `frontend-architecture` lenses skipped — no double review);
   pr-self-review covers bugs/technology lenses + deterministic gates and writes its report;
   plan-verifier checks the plan **and** its source spec's `AC-n`/`NFR-n`.
4. Bounded fix loop (`max-fix`, default 3): fixes CRITICAL/HIGH findings + Missing/Partial
   gaps, re-reviews **only the changed files**; ping-pong items and disputes are reported, not
   looped.
5. Report — incl. the pr-self-review verdict and whether its report went stale after fixes
   (then re-run it before pushing). Never commits or pushes.

## Deliberately not called

| Agent | Why |
|---|---|
| `spec-creator`, `implementation-planner` | run manually in their own chats; both need human approval |
| `test-writer` | switched off to save tokens — coverage comes from implementers' self-verify and the plan's Acceptance |
| `doc-writer` | run manually after the feature is accepted |

## Token-budget decisions

- `architecture-reviewer` and `plan-verifier` run on **sonnet**; plan-verifier preloads only
  `engineering-insights`.
- Implementers run targeted `vitest related` tests, never the full suite in multi mode — the
  full-suite check is plan-verifier's re-run.
- Re-review after fixes is delta-only (changed files + addressed IDs); pr-self-review is
  **not** re-run inside the loop — a sonnet agent re-checks only the addressed P-items.

## Known limitation

Plan parsing is LLM-driven over the markdown fields (`Owned paths`, `Depends-on`) — keep plans
in the `implementation-planner` template format. If a field is ambiguous, the run falls back to
single mode and says so.
