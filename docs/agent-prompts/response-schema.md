---
name: Response Schema Consistency
description: Keep response shapes and error formats stable across changes.
type: rubric
---

# Response schema consistency

Check every changed response type and every changed error path for shape
stability. A schema change that looks like a cleanup can still silently break
every existing consumer.

## Rules
- Never change a field's type in place. If a field must change type, add a new
  field with the new type and deprecate the old one instead of mutating it.
- Never silently drop a field callers may depend on, even one that looks unused
  from the current codebase — you cannot see external consumers from the diff.
- Keep error response shapes consistent across endpoints: the same error
  envelope (e.g. `{ error: { code, message } }`), the same field names, the same
  status-code-to-shape mapping. A one-off error shape on a single endpoint is a
  contract trap for generic client error handling.
- A field becoming nullable/optional when it used to always be present is a
  breaking change for any client that doesn't null-check it, even though the
  type change looks "looser."

## GOOD example — backward-compatible schema change
```diff
 type OrderResponse = {
   id: string;
-  total: number;
+  total: number;        // unchanged, still cents as an integer
+  totalFormatted: string; // new field, e.g. "$12.00" — additive
 };
```
The old field keeps its type and meaning; the new field is purely additive.
Existing clients parsing `total` see no change.

## BAD example — silent breaking schema change
```diff
 type OrderResponse = {
   id: string;
-  total: number;    // cents, e.g. 1200
+  total: string;    // formatted, e.g. "$12.00"
 };
```
Every existing client doing arithmetic on `total` (a number) now receives a
string and breaks or silently produces `NaN`. This is CRITICAL unless
accompanied by a version bump/deprecation window for the old numeric shape —
report the exact type change and the risk to numeric consumers.

## How to check
- Compare the full shape of each changed response type, not just the lines the
  diff touches — a field can be broken by a change to a shared type it references.
- For error paths, check whether the new/changed error still matches the shape
  every other endpoint returns for the same status code.
- Flag inconsistency even when no single endpoint is "wrong" in isolation — two
  endpoints returning different error shapes for the same failure class is a
  contract defect on its own.
