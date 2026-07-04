# Severity scale & the gate

The scale mirrors the repo's `security` skill so findings read consistently.
Report **high-confidence only** (≥ 80). Trace exploitability / real impact before
labelling — "can this actually happen on the changed lines?"

## Scale

| Severity | Criteria | Examples in this repo |
|----------|----------|-----------------------|
| **CRITICAL** | Broken/unsafe change that must not merge | New onion boundary violation (depcruise error), type error, failing affected test, secret in diff, edit to generated `db/migrations/**` or `server/clones/**`, injection/auth bypass, RCE |
| **HIGH** | Exploitable/wrong under conditions; strong smell | Schema changed without migration, shared-contract drift (only one side updated), stored XSS, IDOR, documented `AGENTS.md` convention violated |
| **MEDIUM** | Limited impact / not verified | Missing input validation, integration tests not run (Docker down), CORS/rate-limit gaps |
| **LOW** | Defense-in-depth / nit | Minor a11y, naming, missing non-critical test |

## The gate

- **CRITICAL (unwaived) → `verdict: "block"`.** One is enough to stop push/PR.
- **HIGH / MEDIUM / LOW → advisory.** Reported, never block.

`criticalCount` = number of CRITICAL findings **after** waivers are applied.

## Deterministic vs LLM findings

- **Deterministic** (`source: "deterministic"`): depcruise, typecheck, tests,
  do-not-touch guard, secrets, migration-safety. `confidence: 100`. **No
  adversarial verification** — the tool already proved it.
- **LLM lens** (`source: "lens:<skill>"`): each CRITICAL must survive the skeptic
  pass (SKILL.md step 5) before it counts toward the gate.

## Finding schema

```json
{
  "file": "server/src/modules/reviews/service.ts",
  "line": 42,
  "severity": "CRITICAL",
  "confidence": 100,
  "rule": "service-no-drizzle",
  "why": "Service imports drizzle-orm directly; DB access must go through a repository.",
  "fix": "Move the query into reviews/repository.ts and call it from the service.",
  "waived": false,
  "source": "deterministic"
}
```

## Waivers

`.claude/pr-self-review-waivers.json` records intentional, reviewed exceptions
(committed to the repo). A waiver matches a finding by `rule` + `file` (optionally
`line`) and carries a reason + author. A matched CRITICAL is set `waived: true`,
excluded from `criticalCount`, but kept in the report for visibility.

```json
{
  "waivers": [
    {
      "rule": "routes-no-drizzle",
      "file": "server/src/modules/legacy/routes.ts",
      "reason": "Grandfathered; tracked in TICKET-123, migrating next sprint.",
      "author": "alina",
      "expires": "2026-09-01"
    }
  ]
}
```
