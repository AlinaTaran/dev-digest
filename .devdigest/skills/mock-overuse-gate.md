# Mock overuse gate

Mocks exist to fake an I/O boundary (network, DB, clock, filesystem,
randomness) so a test stays fast and deterministic — not to avoid running the
logic actually under test. Flag tests where mocking has gone far enough that
the test no longer proves the real system works.

## Patterns to flag

- **Mocking the unit under test.** The test mocks the very function, class,
  or module whose behaviour it claims to verify, then asserts the mock was
  called — this proves nothing about the real implementation.
- **Over-broad module mocks.** An entire service, repository, or module is
  mocked when only one narrow boundary within it (e.g. the DB client or an
  HTTP call) needed to be faked. This can hide bugs in all the untested real
  code between the mock and the assertion.
- **Call-only assertions.** The test's only assertions are
  `toHaveBeenCalled`/`toHaveBeenCalledWith` on a mock, with no assertion on
  the actual return value, persisted state, HTTP response, or side effect —
  such a test passes even if the surrounding business logic is wrong.
- **Reimplemented mocks.** A hand-written mock/stub reimplements enough of the
  real dependency's logic (branching, validation, computed return values)
  that the test is effectively testing the mock's logic, not the real
  dependency's contract — and the two can silently drift apart.
- **Mocking the database for business-rule tests.** Repository/DB mocking
  hides real query bugs (wrong filter, wrong join, missing tenant scope);
  prefer a real (test) database for anything asserting on query correctness.
- **Snapshot substitution.** A snapshot test stands in for a behavioural
  assertion on correctness- or security-critical logic; snapshots update
  silently and stop catching regressions.

## How to check

For each mock added or changed in the diff, ask: if the mocked dependency
behaved completely differently (wrong data, thrown error, different shape),
would this test's assertions still pass? If yes, the mock is hiding that
dependency's real contract — flag it with the file:line of the mock and the
assertion it undermines, and suggest either narrowing the mock or adding an
assertion on real output/state.