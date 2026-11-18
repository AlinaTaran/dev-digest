# Corner-case checklist

When reviewing tests for new or changed logic, check whether each of the
following corner cases is relevant to the diff and, if so, whether it is
actually exercised by a test.

## Empty & absent input
- Empty string, empty array, empty object, empty collection/page.
- `null` vs `undefined` — are they handled the same way, and is that
  intentional? A missing optional field vs an explicit `null`.
- A request body or payload missing an expected field entirely.

## Boundary values
- Exactly the minimum and maximum of any range (0, -1, the pagination limit,
  limit + 1, array length - 1 vs array length).
- The first and last element of a collection, not just "some" element.
- Numeric edges: zero, negative numbers where only positive was assumed,
  values near integer overflow, floating-point rounding at a threshold.
- Time edges: exactly at a deadline/expiry, midnight/DST boundaries if dates
  are compared.

## Duplicate / already-exists
- Inserting or processing an entity that already exists (idempotency,
  unique-constraint violations, "create or update" ambiguity).
- The same event or webhook delivered twice.

## Concurrent access
- Two callers racing to read-modify-write the same row or resource.
- A retry after a partial failure (did the first attempt already commit part
  of the work?).
- An operation that should be atomic but touches multiple records/tables.

## Malformed / unexpected shape
- A payload that violates the schema the code assumes (extra fields, wrong
  type, wrong enum value) — especially where validation is claimed but not
  demonstrated by a test.

For each relevant corner case the diff's logic could plausibly mishandle,
confirm a test drives that exact scenario and asserts on the outcome. If a
clearly relevant corner case has no test, flag it by name with the file:line
of the logic it would exercise.