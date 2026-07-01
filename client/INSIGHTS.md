# client — INSIGHTS

Append-only log of decisions, gotchas discovered, and lessons for the web app.
Newest first. Capture what wasn't obvious from the code — the "why" behind a choice,
or a trap someone hit — so the next person (or agent) doesn't relearn it.

## What Works

- **`formatCost` 3 sig figs for sub-cent** — use `Math.floor(Math.log10(usd))` to get the leading digit's magnitude, then `dp = -magnitude + 2` for exactly 3 significant figures. Don't strip trailing zeros for sub-cent amounts — they're significant. Only strip for `$0.01–$0.99` range.

- **Hover popovers must portal to `document.body` + `position: fixed`** — the new generic `HoverCard` (`vendor/ui/kit/HoverCard.tsx`) measures the trigger via `getBoundingClientRect()` and renders the card through `createPortal`. Absolute positioning inside the PR-list table / timeline rows gets clipped by row `overflow`, so don't reach for the click-based `Dropdown` (which uses `position:absolute`) for hover previews. Close on a ~120ms delay (on both trigger and card `mouseleave`, cleared on re-enter) so the pointer can travel into the card to click the `file:line` links; close on scroll/resize to avoid a stale fixed position.

## Session Notes

### 2026-06-30 — formatCost precision fix
- Changed sub-cent branch from `toFixed(4)` (gives 1 sig fig for $0.000717) to log10-based dynamic dp (gives "$0.000717", "$0.000915" — 3 sig figs). The ≥$0.01 branch keeps trailing-zero stripping.

## What Doesn't Work

- **A capture-phase `window` scroll listener that closes a popover will block scrolling INSIDE it** — `HoverCard` closes on page scroll to avoid a stale `position: fixed`, but with `addEventListener("scroll", …, true)` the handler also fires for wheel-scrolls of the card's own inner list, instantly closing it. Guard with `if (cardRef.current?.contains(e.target)) return;` so only page scrolls close the card.

## Codebase Patterns

- **`FindingsPopover` is shared by the PR list and the detail timeline** — it lives at `app/repos/[repoId]/pulls/_components/FindingsPopover/` (the parent `pulls/` route, so both the list `page.tsx`/`PRRow` and the nested `[number]/_components/RunHistory` import it). It takes `findings: Finding[]`; `FindingRecord[]` (timeline reviews) is structurally compatible, so pass it directly. The timeline's per-run findings come for free from the already-loaded `usePrReviews` data — `FindingsTab` builds `findingsByRun` (`run_id → review.findings`) and threads it into `RunHistory`, which falls back to the old "N findings · M blockers" text when a run has no matching review (failed/running).

- **To make a whole row a hover trigger but anchor the card elsewhere, separate the hover area from the anchor** — `HoverCard` supports `block` (wrapper is a full-width `div`, so an entire timeline row is the hover area) + `anchorRef` (a ref to a child, e.g. the severity badges, used for `getBoundingClientRect` positioning). The timeline's `RunRow` (extracted so each row can own a `badgesRef`) wraps the whole row and points `anchorRef` at the badges. NOTE: you can't show a hover-highlight by tinting the `block` wrapper — the row's own `--bg-elevated` is opaque and sits on top; highlight the row element itself if needed. The non-`block` (inline `span`) mode keeps the plaque highlight for the PR-list badges.

## Tool & Library Notes

- **Evenly-spaced round dotted underline** (severity-coloured leader under the findings badges) is a `radial-gradient(circle, COLOR 1.1px, transparent 1.6px)` with `backgroundSize: "5px 2px"`, `backgroundRepeat: "repeat-x"`, `backgroundPosition: "left bottom"` — NOT `border-bottom: dotted`, whose dots render as chunky touching squares. Set `background: transparent` first (bare badge) then the gradient via `backgroundImage` (later key wins over the shorthand's image reset). See `SeverityBadge underline` in `vendor/ui/primitives/Badge.tsx`.

## Recurring Errors & Fixes

## Session Notes

### 2026-06-30 — INSIGHTS log started
**Decision:** Track per-package learnings here, referenced from `client/CLAUDE.md`.
**Why:** `CLAUDE.md` is a thin map; durable history belongs in a lazy-loaded file.
**Consequence:** Add an entry whenever a non-obvious decision or gotcha lands.

## Open Questions
