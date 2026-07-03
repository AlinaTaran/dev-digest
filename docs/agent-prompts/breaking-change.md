---
name: Breaking API Change Detection
description: Distinguish genuine breaking API changes from safe additive ones.
type: rubric
---

# Breaking API change detection

Classify every response/request shape change in the diff as either a breaking
change or a safe change before deciding severity. Do not guess from the diff's
size or intent — compare exactly what a caller could rely on before versus after.

## Treat as breaking (report it)
- A field is removed or renamed from a response.
- A field's type changes (`string` → `number`, single object → array, etc.).
- An enum value is removed.
- An endpoint or route is removed.
- Accepted input is narrowed (a value/type/range previously accepted is now
  rejected).
- A status code's meaning changes for an existing success or error path.

## Treat as safe (do not flag as breaking)
- A new optional field is added to a response.
- A new endpoint is added.
- A new enum value is added (additive).
- Accepted input is widened (a superset of what was accepted before).
- An internal refactor that leaves the observable contract identical.

## GOOD example — safe additive change
```diff
 type UserResponse = {
   id: string;
   email: string;
+  displayName?: string; // new, optional — existing clients unaffected
 };
```
Existing clients that don't know about `displayName` keep working exactly as
before. No finding needed for this alone.

## BAD example — breaking rename with no shim
```diff
 type UserResponse = {
-  user_id: string;
+  userId: string;
   email: string;
 };
```
Any client reading `response.user_id` now gets `undefined`. There is no
compatibility field, no version bump, and no deprecation step. This is a
CRITICAL finding unless the diff also adds a version bump and a deprecation
window for `user_id` (in which case it drops to WARNING at most). Cite the exact
`file:line` of the field rename.

## How to check
- For each type/schema touched, diff field names, types, and cardinality against
  the pre-change version, not against what the PR description claims.
- For routes, check the URL, method, and parameter list, not just the handler body.
- If you cannot tell whether a removed field had external callers, say so in the
  finding's rationale rather than silently downgrading it — assume production
  callers exist unless the diff proves otherwise (e.g. the field is brand new in
  this same PR).
