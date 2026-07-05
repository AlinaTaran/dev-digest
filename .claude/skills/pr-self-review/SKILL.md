---
name: pr-self-review
description: >-
  Use when about to open a pull request — before git push or gh pr create — or when
  asked to review all open branch changes locally. Runs the repo's UI-architecture
  skills on client/ files and backend/domain skills on server/ & reviewer-core/ files,
  runs deterministic gates (depcruise, typecheck, tests), and blocks the push/PR on any
  unwaived CRITICAL finding. Triggers: "review before PR", "self review", "check my
  changes", about to push a feature branch.
---

# PR Self-Review (DevDigest, local pre-PR gate)

**Core principle:** catch problems locally, *before* the PR exists. This skill
reviews the whole branch diff by pointing the repo's own architecture/technology
skills at the files they own, plus deterministic gates, and **refuses to let a
GitHub push/PR proceed while any unwaived CRITICAL finding stands.**

A `PreToolUse` hook (`.claude/hooks/pr-self-review-gate.sh`) enforces the gate on
`git push` / `gh pr create`; this skill produces the report that hook reads.

## When to use

- **Automatically:** when you (or the hook) are about to `git push` or `gh pr create`.
- **Manually:** any time the user asks to review open changes before a PR.
- If the hook already blocked a push telling you to "run pr-self-review" — this is it.

## Workflow

Create a todo per step.

### 1. Compute the diff (branch vs main)

```bash
BASE=$(git merge-base main HEAD)
git diff "$BASE"...HEAD --name-only   # committed on the branch
git diff HEAD --name-only             # + uncommitted (staged + unstaged)
```

Union the two lists (dedupe) = the review set. For each file also capture its
**patch** (`git diff "$BASE"...HEAD -- <file>` and `git diff HEAD -- <file>`) —
lenses review the *changed hunks + context*, never whole files, and must ignore
pre-existing problems outside the diff.

### 2. Eligibility triage (skip trivial diffs)

If the review set is **only** docs / comments / `*.md` / lockfiles / `.gitignore`
and similar non-code, skip the heavy lenses, write a `pass` report (step 6), done.

### 3. Deterministic layer FIRST (cheap, hardest signal)

Run on the affected packages *before* spending tokens on LLM lenses. Any failure
here is a finding with the severity noted (mostly CRITICAL). See `severity.md`.

1. **Onion boundary gate** (if `server/**` or `reviewer-core/**` changed):
   ```bash
   cd server && npx depcruise \
     --config ../.claude/skills/onion-architecture/dependency-cruiser.arch.cjs \
     --ignore-known ../.claude/skills/onion-architecture/known-violations.json \
     src ../reviewer-core/src
   ```
   Non-zero exit = a **new** boundary violation = **CRITICAL** (deterministic).

   **If `dependency-cruiser.arch.cjs` / `known-violations.json` are missing** (the
   gate hasn't been bootstrapped): follow `onion-architecture/enforcement.md` once
   to write the config and baseline, *then* run the gate. If you can't bootstrap
   (e.g. `server/node_modules` absent), skip the deterministic check, record a
   **MEDIUM** "onion gate not bootstrapped" note, and rely on the
   `onion-architecture` LLM lens (step 4) instead — do not treat the skip as a pass.
2. **Typecheck** each affected package (`pnpm typecheck` in client/server; `npm run
   build` = `tsc --noEmit` in reviewer-core). Type error = **CRITICAL**.
3. **Affected tests** (per root `CLAUDE.md`): server unit
   `pnpm exec vitest run --exclude '**/*.it.test.ts'`; client `pnpm test`;
   reviewer-core/e2e their own. Failure = **CRITICAL**. Integration `.it.test.ts`
   only if Docker is up — otherwise record a MEDIUM "not verified" note.
4. **"Do not touch" guard:** if the diff edits `server/clones/**` or
   `server/src/db/migrations/**` (generated) → **CRITICAL** (see `CLAUDE.md`).
5. **Secrets scan** over the patches (API keys, tokens, `.env` values) → **CRITICAL**.
6. **Migration safety:** `db/schema/**` changed but no new `db/migrations/**` file
   (drizzle-kit not regenerated), or vice versa → **HIGH**.

### 4. LLM lenses (parallel subagents)

Classify files and dispatch one subagent per applicable **(skill × file group)**
per `routing.md`. Use `superpowers:dispatching-parallel-agents`. Each subagent:
- loads its lens skill via the `Skill` tool,
- receives only its relevant files + their patches,
- returns structured findings:
  `{file, line, severity, confidence, rule, why, fix}` (see `severity.md`).

Skip a group's lenses when the diff contains no files of that group.

### 5. Adversarial verification of CRITICALs

Every **LLM** CRITICAL (not the deterministic ones from step 3) goes to a second
skeptic subagent that tries to *refute* it. Keep it only if it survives (confidence
≥ 80, ≥ 2 votes agree it's real). This prevents false positives from blocking work.

### 6. Merge, apply waivers, gate, write report

- Dedupe findings by `file:line:rule`.
- Apply `.claude/pr-self-review-waivers.json` (if present): a matched waiver drops a
  CRITICAL out of the gate but stays in the report as `waived: true`.
- `criticalCount` = unwaived CRITICALs. `verdict` = `"block"` if `criticalCount > 0`,
  else `"pass"`.
- Write `.claude/pr-self-review-report.json` (schema below). The `diffHash` **must**
  be computed with the exact command below so the hook's freshness check matches:
  ```bash
  BASE=$(git merge-base main HEAD)
  { git diff "$BASE"...HEAD; git diff HEAD; } | shasum -a 256 | awk '{print $1}'
  ```
- Print a human markdown summary to the terminal, grouped by severity, each finding
  as `file:line — severity — why → fix`.

Report schema:
```json
{
  "headSha": "<git rev-parse HEAD>",
  "diffHash": "<sha256 per the command above>",
  "verdict": "pass | block",
  "criticalCount": 0,
  "findings": [
    {"file": "", "line": 0, "severity": "CRITICAL|HIGH|MEDIUM|LOW",
     "confidence": 0, "rule": "", "why": "", "fix": "", "waived": false,
     "source": "deterministic|lens:<skill>"}
  ]
}
```

### 7. Report the verdict to the user

- `verdict: "pass"` → say the gate is open; push/PR may proceed.
- `verdict: "block"` → list the unwaived CRITICALs and **do not push**. Fix them
  (or add a justified waiver), then re-run from step 1.

## The gate rule (non-negotiable)

**One unwaived CRITICAL = no push, no PR.** HIGH/MEDIUM/LOW are advisory and never
block. Do not push a branch whose latest report is `block` or stale.

**Violating the letter of this rule violates its spirit.** The whole point is to
stop bad changes *before* the PR — pushing anyway defeats it.

### Escape hatch

A genuine emergency override exists and is logged: `PR_SELF_REVIEW_BYPASS=1 git push`.
Use it only when the user explicitly asks; never as a way to skip fixing a finding.

## Red flags — STOP

- "The CRITICAL is probably a false positive, I'll push." → Verify it (step 5) or
  waive it with a reason; don't push on a hunch.
- "I only changed one file since the review, no need to re-run." → The diff changed;
  the report is stale; the hook will (correctly) block. Re-run.
- "Tests fail but they're unrelated / pre-existing." → Failing affected tests are
  CRITICAL. Confirm they failed *before* your branch; if so, note it — don't assume.
- "I'll just bypass to save time." → Bypass is for emergencies the user approved.

| Rationalization | Reality |
|---|---|
| "It's a small diff, skip the review" | Small diffs ship CRITICALs too. Triage (step 2) already skips truly trivial ones. |
| "depcruise/typecheck is overkill locally" | It's the cheapest, surest signal and it's already installed. Run it. |
| "I'll fix the CRITICAL in a follow-up PR" | The gate exists so it never reaches a PR. Fix or waive now. |
| "Reviewing whole files is more thorough" | Whole-file review flags others' pre-existing debt and blocks unfairly. Diff hunks only. |

## Related skills (lenses — invoked by subagents, not `@`-linked)

UI: `frontend-architecture`, `react-best-practices`, `next-best-practices`,
`react-testing-library`.
Backend/domain: `onion-architecture`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`.
Both: `typescript-expert`, `security`, `zod`.
Orchestration: `superpowers:dispatching-parallel-agents`.

See `routing.md` for the exact file-group → lens map and `severity.md` for the
scale and gate.
