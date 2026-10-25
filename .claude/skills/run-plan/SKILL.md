---
name: run-plan
description: >-
  Execute an already-approved implementation plan (docs/plans/<feature>.md from
  implementation-planner) fully autonomously and bring the feature to a review-ready state:
  implementer agents (multi-agent by DAG, or single), then architecture-reviewer ∥
  pr-self-review ∥ plan-verifier in parallel, then a bounded fix loop that re-reviews only
  changed files.
  Never commits or pushes. Invoked manually only.
argument-hint: "plan:docs/plans/<feature>.md [mode:single|multi] [max-fix:N]"
disable-model-invocation: true
---

# run-plan

```
/run-plan plan:docs/plans/<feature>.md [mode:single] [max-fix:2]
```

You are the **orchestrator**. The plan was already reviewed and approved manually, so you run
**fully autonomously** — no confirmations, no questions mid-run. You dispatch agents and run
read-only / test commands; every code change goes through an `implementer`.

**Not called here:** `spec-creator` and `implementation-planner` (run manually beforehand) and
`test-writer` (deliberately off — test coverage comes only from the implementers'
self-verify and whatever the plan's task Acceptance asks for).

Reply to the user in the language of their request; agent prompts stay in English.

## Arguments (`$ARGUMENTS`)

| Arg | Required | Default | Meaning |
|---|---|---|---|
| `plan:<path>` | yes | — | the approved plan. A bare path without `plan:` is accepted too |
| `mode:single\|multi` | no | the plan's `Execution mode` | override execution mode |
| `max-fix:N` | no | `3` | max fix-loop iterations (step 4) |

No plan path, or the file doesn't exist → stop and say so. Unknown args → ignore and mention
them in the report.

## 1. Read the plan

- Read the plan in full: tasks/steps, `Type`, `Owned paths`, `Depends-on`, `Test + typecheck`,
  `Acceptance`, `Execution mode`. Note the source spec on its `Requirements:` line (if any) —
  `plan-verifier` needs it.
- **multi:** build the DAG from `Depends-on` → waves (a wave = tasks whose dependencies are all
  done). Sanity-check that parallel tasks in one wave have disjoint Owned paths; if two
  overlap, serialize them (put the later one in the next wave) and mention it in the report.
- **single:** one `implementer` walks all steps in order.
- Record the baseline: `git rev-parse HEAD` + `git status --short`. The run's change set =
  files changed since this baseline — pre-existing WIP on the branch is never reviewed, fixed,
  or touched.

Parsing is LLM-driven over the plan's markdown fields — it relies on the plan following the
`implementation-planner` template (`### T1 — …`, `**Owned paths:**`, `**Depends-on:**`). If a
field can't be read unambiguously, fall back to `mode:single` and say so in the report.

## 2. Implement

- **multi:** for each wave, dispatch one `implementer` per task **in a single message**
  (parallel). Each prompt: plan path + task ID, the other tasks' Owned paths (stay clear), and
  "self-verify with targeted tests + typecheck filtered to your paths (your Step 5); do not run
  the full suite". Next wave starts when the current one has returned.
- **single:** one `implementer` with the plan path, all steps in order, and "run the full
  module suite + typecheck at each step's checkpoint".
- An implementer that reports red or a blocker → re-dispatch it once with the failure output.
  Still red → note it, continue with tasks that don't depend on it, and let step 3 surface it.

## 3. Review ∥ self-review ∥ verify (parallel, read-only)

Dispatch **all three in a single message**:

- **`architecture-reviewer`** — target = the run's change set (list the files explicitly +
  `git diff <baseline>`). Tell it the review target is exactly that set. Owns **all**
  architecture findings (onion/DI, boundaries, frontend structure).
- **`pr-self-review`** — via a `general-purpose` agent whose prompt is: "Invoke the
  `pr-self-review` skill and follow it exactly (diff, deterministic gates, report file).
  **Skip the `onion-architecture` and `frontend-architecture` LLM lenses** — a parallel
  `architecture-reviewer` covers architecture; keep the depcruise gate and every other lens.
  Return the findings list and the verdict." It owns correctness / technology-lens bugs and
  the deterministic gates, and writes `.claude/pr-self-review-report.json`.
- **`plan-verifier`** — plan path + spec path + baseline commit. It re-runs the module suites
  and typecheck itself.

Merge the three results into one **fix list** (dedupe by `file:line`; if architecture-reviewer
and pr-self-review flag the same spot, keep one item):

| Source | Goes into the fix list | Not fixed, only reported |
|---|---|---|
| architecture-reviewer | CRITICAL, HIGH | MEDIUM, LOW |
| pr-self-review | CRITICAL, HIGH **inside the run's change set** | MEDIUM, LOW, anything outside the change set (pre-existing branch WIP) |
| plan-verifier | Missing, Partial, red suite/typecheck | Deviated (plan vs code judgement), Unverifiable |

Give each item a stable ID: `F-n` architecture findings, `P-n` pr-self-review findings, `G-n`
verification gaps. IDs are never reused or renumbered.

## 4. Bounded fix loop (`max-fix`, default 3)

While the fix list is non-empty and iterations < `max-fix`:

1. **Fix.** Group the items by file into file-disjoint `implementer` tasks and dispatch them in
   parallel. Each prompt carries the items verbatim (ID, file:line, rule / requirement, why,
   suggested fix) and: "fix only these items; targeted tests + filtered typecheck; if you
   believe an item is wrong, change nothing for it and reply `DISPUTED <ID>: <reason>`."
   Disputed items leave the loop and go to the report.
2. **Re-review only what changed.** Dispatch in parallel, scoped to the files the fixes
   touched:
   - `architecture-reviewer`: those files + the F-items addressed → per item
     `resolved | not resolved`, plus new CRITICAL/HIGH on the changed lines only;
   - a `general-purpose` agent (sonnet) — **not** a full `pr-self-review` re-run: those files
     + the P-items addressed → per item `resolved | not resolved`, plus new CRITICAL/HIGH bugs on
     the changed lines only;
   - `plan-verifier`: re-check only the G-rows addressed, and re-run the suites + typecheck of
     the touched modules (this also re-covers pr-self-review's deterministic gates).
3. New fix list = `not resolved` + new CRITICAL/HIGH + rows still Missing/Partial + red suites.
   An item `not resolved` twice, or one that reappears after being resolved → drop it from the
   loop and report it (no ping-pong).

After the last iteration, anything still open goes to the report as **open**.

## 5. Report

Never commit, stage, or push. Report:

- **Execution:** mode, waves/steps, per-task result, any serialized tasks or parse fallbacks.
- **Coverage:** plan-verifier's `X/N Done` (final), open gaps.
- **Findings:** fixed · open · disputed · reported-only (MEDIUM/LOW, Deviated, Unverifiable).
- **Fix loop:** iterations used / `max-fix`.
- **Gates:** final suite + typecheck results with the exact commands (from plan-verifier's
  last run).
- **Changed files** (since baseline).
- **pr-self-review verdict** from step 3. If the fix loop changed any file, say explicitly
  that `.claude/pr-self-review-report.json` is now **stale** (its `diffHash` no longer
  matches) — the push gate will block until `pr-self-review` is re-run.
- **Next step:** re-run `pr-self-review` (if stale) → commit → push / PR.

## Hard rules

- No code edits by you — only `implementer` changes code.
- Never touch files outside the run's change set; never commit/push.
- Never claim green without test output produced in this run.
- Never weaken a test, add `.skip`, or drop a finding to end the loop — report it instead.
- Keep your context lean: rely on agents' summaries; read files only to resolve a conflict.
