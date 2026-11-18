# Branch coverage gate

Every conditional branch added or modified in this diff must have at least
one test case that exercises it. A "branch" includes:

- Both arms of an `if`/`else` (and every `else if`).
- Every `case` in a `switch`, including `default`.
- Both sides of a short-circuit (`&&`, `||`, `??`) when either side has an
  observable effect (a call, a default value, a thrown error).
- Both branches of a ternary or ternary chain.
- An early `return`/`throw` guard clause, as well as the path that falls
  through it.
- The zero-iteration case of a loop over a collection, in addition to the
  one-or-more-iteration case.

## Rule

For each new or changed branch, name the input or state that would route
execution down it, and confirm a test actually supplies that input and
asserts on the resulting behaviour (output, thrown error, side effect, or
response) — not just that a mock was invoked.

## How to check

1. List every branch point the production diff introduces or changes.
2. For each one, look for a test case in the diff whose setup would make
   execution take that branch.
3. If a branch has no such case, report it: name the exact file:line of the
   branch and the input that has no test driving it.
4. If a branch is only covered indirectly (e.g. an integration test that
   happens to pass through it without asserting on its effect), treat it as
   uncovered — the test must observably fail if the branch's logic were
   reverted or inverted.

## Exceptions

Defensive branches that are provably unreachable (guarded by a type-system
invariant enforced elsewhere) may be noted rather than required to have a
dedicated test, but call out the assumption explicitly. Logging-only branches
with no behavioural effect are not required to be covered by this gate.