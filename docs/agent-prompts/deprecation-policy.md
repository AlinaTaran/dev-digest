---
name: Deprecation Before Removal
description: Require a deprecation window instead of an outright removal.
type: rubric
---

# Deprecation before removal

Removing a field, route, or parameter should be the last step of a multi-PR
process, not the first. Check whether the diff skips straight to removal
without ever having deprecated the thing it's removing.

## Rules
- Before removing a field/route/param, it must first have been marked
  deprecated: an `@deprecated` doc comment, a `Deprecation`/`Sunset` response
  header, or a documented sunset date in the API docs/changelog.
- The deprecated path must stay functional for a stated window (a release count
  or a calendar date) before it is actually removed — deprecating and removing
  in the same PR is not a deprecation, it's a removal with an apology.
- The replacement must be communicated: a docstring or changelog entry pointing
  to what callers should use instead, not just a note that the old thing is gone.
- A removal PR is safe only when it can point to an earlier PR/commit that
  started the deprecation window and show the window has elapsed.

## GOOD example — deprecate first, remove later
PR 1 (this release):
```ts
export type UserResponse = {
  id: string;
  /** @deprecated Use `email` instead. Removed in v3 (2026-10-01). */
  emailAddress: string;
  email: string;
};
```
PR 2 (after the stated window, in a later release):
```diff
 export type UserResponse = {
   id: string;
-  /** @deprecated Use `email` instead. Removed in v3 (2026-10-01). */
-  emailAddress: string;
   email: string;
 };
```
The field was marked deprecated with a replacement and a sunset date, shipped
for a full window, then removed in a separate PR after the date passed. No
finding needed for PR 2 given this history.

## BAD example — remove and replace in the same PR, no deprecation step
```diff
 export type UserResponse = {
   id: string;
-  emailAddress: string;
+  email: string;
 };
```
`emailAddress` never went through a deprecation window — it disappears the
moment `email` appears. Any caller reading `emailAddress` breaks immediately
with no warning. This is CRITICAL: report the missing deprecation step and note
that the fix is to keep `emailAddress` (marked deprecated) alongside `email`
for at least one release.

## How to check
- When a diff removes a field/route/param, check whether it was already marked
  `@deprecated` (or equivalent) in a prior state — if the diff is your only
  evidence and it shows no prior deprecation marker, assume none existed.
- When a diff both adds a replacement and removes the old thing in one PR, that
  is the single clearest deprecation-policy violation to flag.
- A deprecation marker with no stated window or replacement is itself a
  WARNING-level gap, even if nothing is being removed yet.
