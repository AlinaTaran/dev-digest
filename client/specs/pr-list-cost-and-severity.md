# client — PR list: COST + FINDINGS columns

Behavior spec for the cost and severity columns in the PR list row (`PRRow`). Architecture
context: `client/docs/architecture.md`. Server side: `server/specs/run-cost-tracking.md`.

## The grid

The PR-list row grid (`pulls/constants.ts`, `GRID`) carries these columns; `findings` and
`cost` were added:

```
"1fr 132px 92px 60px 120px 118px 80px 78px"
        ↑ findings   ↑ cost
```

## FINDINGS column

Renders severity badges from `pr.findings` (`{ CRITICAL, WARNING, SUGGESTION }`), using
`SeverityBadge` (`@devdigest/ui`) in `compact` mode:

- Show a `SeverityBadge severity=… count=N compact` **only for severities with `count > 0`**
  (in CRITICAL → WARNING → SUGGESTION order).
- All three zero (a review ran, found nothing) → muted `—`.
- `pr.findings == null` (no review yet) → muted `—`.

So a blank-looking cell can mean two different things on the data side (no review vs clean
review); both render `—` on purpose — the score column distinguishes them.

## COST column

Renders `formatCost(pr.cost_usd)` — the **cumulative** cost across all completed runs of
the PR. Uses `tabular-nums` so the column stays aligned.

### `formatCost` rules (`src/lib/format.ts`)

| Input | Output | Why |
|---|---|---|
| `null` / `undefined` | `—` | unknown / no priced run |
| `0` | `$0.00` | known zero |
| `>= 1` | `$X.XX` (2 dp) | normal money |
| `0.01 – 0.99` | 3 dp, trailing zeros stripped (`$0.05`, `$0.125`) | cents |
| `< 0.01` (sub-cent) | **3 significant figures**, zeros kept (`$0.000717`) | model calls are fractions of a cent; `toFixed(4)` would collapse to 1 sig fig |

Sub-cent precision is computed as `dp = -Math.floor(Math.log10(usd)) + 2`, giving exactly
3 significant digits. Trailing zeros in the sub-cent branch are **significant** and must not
be stripped.

## i18n

Column headers/labels live in the `runs` / `prReview` message namespaces under
`messages/en/`.

## Tests

`src/lib/format.test.ts` covers each `formatCost` branch (null, zero, ≥1, cents,
sub-cent precision). Component tests for the row live alongside `PRRow`.
