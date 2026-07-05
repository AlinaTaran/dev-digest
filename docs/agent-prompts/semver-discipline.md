---
name: Semver & Version-Bump Discipline
description: Require a version signal proportional to the contract change.
type: rubric
---

# Semver & version-bump discipline

Every change to the API contract needs a version signal proportional to its
impact. Check the diff for both the contract change and the accompanying
signal — a breaking change with no signal at all is the single most common gap.

## What each kind of change requires
- **Breaking change** (see breaking-change rubric) → major version bump, an
  API version header/path bump, or an equivalent explicit signal, plus ideally
  a migration note in the changelog/PR description.
- **Additive change** (new optional field, new endpoint) → minor version bump
  or changelog entry; not strictly required to block merge, but its absence is
  worth a SUGGESTION-level note if the project otherwise tracks these carefully.
- **Bug fix with no contract change** → patch version bump; no contract review
  action needed beyond confirming the contract truly didn't move.

## How to recognize a missing signal
Look for any of these alongside a contract change: a version field bump in
`package.json` or an API version constant, a path/header version segment
(`/v2/...`, `Accept-Version:`), or a changelog/migration-notes entry. If the
diff changes response/request shape and none of these appear anywhere in the
diff, treat it as unversioned.

## GOOD example — breaking change with a proper signal
```diff
-router.get('/v1/orders/:id', getOrderV1);
+router.get('/v1/orders/:id', getOrderV1); // kept for existing clients
+router.get('/v2/orders/:id', getOrderV2); // total is now a formatted string
```
```md
## Migration notes
`GET /v2/orders/:id` returns `total` as a formatted string instead of cents.
`/v1` remains available and unchanged until its deprecation window ends.
```
The breaking change is isolated to a new version path, the old path keeps
working, and there's an explicit migration note. At most a WARNING, since
existing `/v1` callers are unaffected.

## BAD example — breaking change with no version signal
```diff
-router.get('/orders/:id', getOrder); // total: number (cents)
+router.get('/orders/:id', getOrder); // total: string (formatted)
```
No new path, no header, no changelog entry, no `package.json` bump anywhere in
the diff. Every existing caller of `/orders/:id` is broken with zero warning.
This is CRITICAL — cite the route and the missing signal explicitly in the
finding.

## How to check
- When you find a breaking or additive change, search the rest of the diff (and
  note if you can't see files outside it) for a version marker before deciding
  severity.
- Do not accept a version bump for an unrelated package/dependency as satisfying
  this — it must be the API's own version signal.
- A "fix" that quietly also changes a response shape still needs the same
  version discipline as an intentional contract change; scope creep doesn't
  exempt it.
