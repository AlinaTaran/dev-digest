# frontend-architecture — skill reference

Meta-documentation for the `frontend-architecture` skill: what it is, when it fires, how it differs from neighbouring skills, its version history, and the full list of sources the guidance was built from.

## Files (progressive disclosure)

- **`SKILL.md`** — lean core: the six principles, the 5-step "where does this go?" decision framework, the sibling-skill boundary table, red flags, and navigation. Loaded first.
- **`folder-structure.md`** — layout strategies (flat → by-type → feature-based → FSD, and Atomic Design), colocation, barrels, naming, constants/config, and `utils` vs `helpers`.
- **`component-organization.md`** — when a component earns its own file (SRP, composition) and the presentation/logic/network layer split, including extracting hooks.
- **`nextjs-organization.md`** — App Router structure: server/client boundary as layout, `_private` folders, route groups, `src/`, and where the data layer / server actions live.
- **`README.md`** — this file.

## Focus

**One job: *where frontend code lives and how a React + TypeScript app is structured.*** It answers placement and layout questions — folder structure, where components/hooks/utils/constants belong, when a component earns its own file, where business logic sits, colocation, barrel-file decisions, and choosing between feature-based / Feature-Sliced Design / Atomic Design. It is Next.js App Router aware.

### Covers
- Feature-first folder structure and the `shared → features → app` dependency direction
- Colocation and the "promote on reuse" rule
- When (and when not) to split a component into its own file/folder
- Separating presentation / business logic / network (api-service layer, custom hooks, `model`)
- Constants/config placement; the `utils` vs `helpers` (non-)distinction
- Barrel/`index.ts` tradeoffs
- Naming conventions
- Methodology comparison: feature-based vs FSD vs Atomic Design (with "when to choose")
- Next.js App Router structural concerns: server/client boundaries, colocation primitives (`_folder`, `(group)`, `src/`), where data fetching lives, TanStack Query wiring

### Does NOT cover (by design — avoids overlap)
- How to *write* a good component, hook, or state update
- Hook dependency bugs, memoization, re-render performance
- Data-fetching/caching *mechanics* and query behavior
- Testing, type-level programming

Those live in the related skills below.

## Target cases (when to reach for it)

- "Where should this component / hook / util / constant go?"
- "Should I split this component?"
- "How do I lay out a new frontend / restructure this growing one?"
- "Which architecture — feature-based, FSD, or Atomic Design?"
- "Should I add an `index.ts` barrel here?"
- "Where does business logic / data fetching belong?"

## Relationship to other skills

| Skill | Its job | Boundary vs this skill |
|---|---|---|
| **`react-best-practices`** | How to write components/hooks/state; anti-patterns, performance | It's *how to write*; this skill is *where it goes*. Component-split **thresholds**, inline-JSX constants, and hook-misuse rules stay there. |
| **`next-best-practices`** | Next.js file conventions, RSC boundaries, data patterns, route handlers in depth | Overlaps on App Router structure; this skill only covers the **placement/boundary** view and defers mechanics there. |
| **`react-testing-library`** | Testing components/hooks | Orthogonal — testing comes after placement. |
| **`typescript-expert`** | Type-level programming, tooling, monorepo/path-alias mechanics | Complementary — this skill decides folders; that skill wires the types/aliases. |

**Deliberate non-duplication:** the existing `react-best-practices` skill already has a short `## Code Organization` section (feature-based colocation, shared-utils location, file ordering) and covers "business logic in hooks/helpers" + module-level constants. This skill goes **deep** on structure/placement and cross-references rather than repeating those.

## Alignment with this repo (`client/`)

Guidance is compatible with the repo's actual conventions, and examples reference them:
- **Thin pages / fat views** — logic in route-colocated `app/**/_components/<Feature>/` (Next.js private folders).
- **API funneled** through `src/lib/api.ts` + `src/lib/hooks/`; components never call `fetch` directly.
- **State split 3 ways** — server data → TanStack Query, app singletons → React Context, view state → URL params.
- Repo intentionally has **no `constants/` folder and no `utils`/`helpers` split** — shared utilities are flat files in `src/lib/`. The skill notes this so its generic advice doesn't fight the codebase.

## Version / changelog

Current version: **1.1.0** (also set in `SKILL.md` frontmatter `version:`).

- **1.1.0** — Added guidance derived from auditing a real repo: external-backend (separate-API) architectures, required route-level error/loading/not-found files, prefetching from RSC against an external API, a concrete barrel-vs-boundary criterion + migration note, PascalCase-component / kebab-case-else naming reconciliation, and a page-size orchestration-extraction heuristic.
- **1.0.0** — Restructured into progressive disclosure: a lean `SKILL.md` core (six principles + a 5-step decision framework + boundary table + navigation) that points to three focused reference files (`folder-structure.md`, `component-organization.md`, `nextjs-organization.md`). Same sourced content as 0.1.0, reorganized so agents load only what the decision at hand needs.
- **0.1.0** — Initial release. Built from a deep-research pass (31 sources, 111 extracted claims, adversarial verification). Covered the 7 placement topics, the feature-based/FSD/Atomic comparison, and a Next.js App Router section in a single monolithic `SKILL.md`. Baked in the corrected current FSD layer set (`widgets` added, `processes` deprecated).

## Sources

All links used in the research, verbatim, grouped by area.

### Official / primary docs
- Feature-Sliced Design — Overview: https://feature-sliced.design/docs/get-started/overview
- FSD — Layers (canonical layer list): https://feature-sliced.design/docs/reference/layers
- FSD — Slices and segments: https://feature-sliced.design/docs/reference/slices-segments
- FSD — Building Scalable Systems with React (blog): https://feature-sliced.design/blog/scalable-react-architecture
- FSD — Docs home: https://feature-sliced.design/
- Next.js — Project Structure: https://nextjs.org/docs/app/getting-started/project-structure
- Next.js — Server and Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Next.js — Fetching Data: https://nextjs.org/docs/app/getting-started/fetching-data
- Next.js — App Router docs hub: https://nextjs.org/docs/app
- Next.js — `fetch` API reference: https://nextjs.org/docs/app/api-reference/functions/fetch
- TanStack Query — Advanced Server Rendering: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
- TanStack Query — Prefetching & Router Integration: https://tanstack.com/query/latest/docs/framework/react/guides/prefetching

### Component splitting & business-logic separation
- Kent C. Dodds — When to break up a component: https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components
- Patterns.dev — Container/Presentational Pattern: https://www.patterns.dev/react/presentational-container-pattern/
- Profy.dev — Separate API Layers in React (6 steps): https://profy.dev/article/react-architecture-api-layer
- Martin Buchalik — The Controller Pattern: https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a
- cekrem — Single Responsibility Principle in React: https://cekrem.github.io/posts/single-responsibility-principle-in-react/
- Felix Gerschau — Separation of concerns with React hooks: https://felixgerschau.com/react-hooks-separation-of-concerns/

### Folder structure & methodology
- Robin Wieruch — React Folder Structure Best Practices [2026]: https://www.robinwieruch.de/react-folder-structure/
- Bulletproof React — project-structure.md: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Profy.dev — Popular React Folder Structures & Screaming Architecture: https://profy.dev/article/react-folder-structure
- Sandro Roth — How to structure your React projects: https://sandroroth.com/blog/project-structure/
- Godel Technologies — FSD: A Guide to Scalable Frontend Architecture: https://www.godeltech.com/blog/feature-sliced-design-a-guide-to-scalable-frontend-architecture/
- Code With Seb — Atomic Design + Feature Slices: https://www.codewithseb.com/blog/from-components-to-systems-scalable-frontend-with-atomiec-design
- freeCodeCamp — Reusable Architecture for Large Next.js Apps: https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/

### Barrel / index re-exports
- TkDodo — Please Stop Using Barrel Files: https://tkdodo.eu/blog/please-stop-using-barrel-files
- basarat — TypeScript Deep Dive: Barrel: https://basarat.gitbook.io/typescript/main-1/barrel

### TanStack Query data-layer organization
- TkDodo — Effective React Query Keys: https://tkdodo.eu/blog/effective-react-query-keys
- TkDodo — Practical React Query: https://tkdodo.eu/blog/practical-react-query
- TkDodo — The Query Options API: https://tkdodo.eu/blog/the-query-options-api
- TkDodo — Creating Query Abstractions: https://tkdodo.eu/blog/creating-query-abstractions

### Verification note
Adversarial verification (3-vote) refuted only the **outdated FSD layer enumeration** (`processes` listed, `widgets` missing). The skill uses the corrected current set: `app · pages · widgets · features · entities · shared`, `processes` deprecated. Source of truth: https://feature-sliced.design/docs/reference/layers
