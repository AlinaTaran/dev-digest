# Component organization & business-logic layers

The *organizational* angle on components: when a piece earns its own file, how to compose, and where logic lives. Applies principle 5 from `SKILL.md`. (For *how to write* a good component — props, keys, effects — see `react-best-practices`.)

## When a component earns its own file

**Don't split preemptively.** A large *straightforward* component is easier to maintain than a prematurely fragmented one. "It feels big" / a line count is **not** a reason.

Split only when you hit a **concrete problem:**
- re-render performance (a hot subtree needs isolation);
- **real reuse** (a 2nd caller actually exists — not a guessed future one);
- state wants to be **colocated lower** than the current component allows;
- tests are getting unwieldy because the component does too much;
- persistent **merge conflicts** from unrelated changes in one file;
- poor encapsulation (internal detail is leaking).

Guiding heuristics:
- **Single Responsibility / "reasons to change":** if two behaviors change for different reasons, they can live in different files. If they always change together, keep them together.
- **Duplication is cheaper than the wrong abstraction.** Extract on the 2nd *real* need, not the 1st guess. Every abstraction has a cost.

**Graduation path:** inline → **own file** (once genuinely reused) → **own folder** (component + test + styles + single-use helpers) as it accretes siblings.

## Composition over configuration

Prefer composing small pieces over one component with many boolean/mode props.
- Push shared markup into a wrapper that takes **`children`** rather than prop-drilling data through layers.
- A component drowning in `if (variant === …)` branches is usually several components wearing a trench coat.

## The three layers (keep components dumb)

Separate concerns into distinct places:

| Layer | Responsibility | Where it lives |
|---|---|---|
| **Presentation** (`ui`) | props in → render out; no data access, no mutation | the component / `ui` segment |
| **Logic** | state, orchestration, business rules | **custom hooks** and/or a slice `model` |
| **Network / transport** | requests, endpoints, client config | a dedicated **api / service layer** |

Rules that fall out of this:
- **Presentational components** take data via props and don't modify it → highly reusable, trivially testable (often pure), safe for a designer to touch.
- **Business logic → custom hooks.** Modern React uses hooks in place of the old "container" component layer (Dan Abramov retracted the container/presentational split in 2019 in favor of hooks). A `useInvoices()` hook can feed a presentational component directly — no wrapper component needed.
- **The api layer hides transport.** Hooks must **not** know endpoints or that Axios/`fetch` is used. Centralize the base URL, auth headers, and client instance in one `api` module so requests can change **without touching UI code**.

### Extracting a hook (the organizational move)
When a component mixes fetching/state with rendering, pull the logic into a hook:
- keeps data-fetching **out of the UI** while **colocated** with its usage;
- lets you test the logic independently of the view;
- changing the hook doesn't touch the component, and vice-versa.

Keep the hook **colocated** with its component until a 2nd feature needs it (then promote — see `folder-structure.md`). A hook used by one component belongs in that component's file or an adjacent `hooks.ts`, not a global `hooks/` bucket.

### Page size: thin pages, fat views
A page (or top-level component) that stays at **plumbing** — wiring routing to rendering — can stay one file. Once it accumulates **data orchestration** (multiple queries, mutations, derived state, coordination between them), extract that orchestration:
- **preferred:** a **colocated custom hook** (`useAgentEditor()`) — the page/view just calls it and renders;
- **alternative:** a **view component** the thin page delegates to.

Either way the page stays thin. This is the **"thin pages, fat views"** seam — the page is a shell; orchestration and rendering live in the extracted hook/view. (This repo applies it as `app/**/_components/<Feature>/` — see `nextjs-organization.md`.)

**This repo:** the logic/network split is already institutional — all API access goes through `src/lib/api.ts`, consumed via hooks in `src/lib/hooks/`; components never call `fetch` directly. Follow that seam.
