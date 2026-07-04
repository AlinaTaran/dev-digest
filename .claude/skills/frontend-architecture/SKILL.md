---
name: frontend-architecture
version: "1.1.0"
description: "Use when deciding where frontend code should live or how to structure a React + TypeScript app — folder layout, where components/hooks/utils/constants belong, when a component earns its own file, where business logic goes, colocation, barrel-file decisions, or choosing between feature-based / Feature-Sliced Design / Atomic Design. Next.js App Router aware."
---

# Frontend Architecture & Code Organization

**Scope:** *where code lives and how it's structured.* Not *how to write it* — component design, hook rules, performance, and data-fetching mechanics belong to the RELATED skills below. This skill answers "where does this go?" and "how do I lay this out?".

## Six principles

Every specific decision in this skill is an application of these:

1. **Organize by feature/scope, not by technical type.** A folder should scream what the app *does*, not what framework it uses.
2. **Colocate by default.** A file lives next to the thing that uses it.
3. **Promote on reuse.** Move code "up" to a shared location *only* when a 2nd consumer appears — never preemptively.
4. **Depend in one direction.** `shared → features → app`. Features never import each other; lift the shared piece down instead.
5. **Separate by layer.** Presentation (dumb UI) ≠ logic (hooks/model) ≠ network (api/service). Keep them in distinct places.
6. **Keep public surfaces explicit, avoid app-dir barrels.** Encapsulate a feature behind one entry point; don't scatter re-export `index.ts` files across application folders.

## Decision framework — "where does this go?"

Walk these in order for any component, hook, util, constant, or type:

1. **Used by only one component?** → keep it **colocated** (inline, or an adjacent `utils.ts` / `hooks.ts` next to that component).
2. **Used across one feature?** → put it in **that feature's folder**, in the right segment (see step 4).
3. **Used by 2+ features?** → **promote to shared** (`shared/` · `lib/` · top-level `components/`).
4. **Which layer/segment?** → presentation → `ui`/component; state + business logic → a hook or `model`; network/transport → `api`/service; static values/enums/flags → `config`/constants.
5. **How is it imported?** → import the file **directly**. Add a public-API `index.ts` **only** for a library or a whole feature/slice boundary — not for arbitrary folders.

When a page/component outgrows plumbing and starts accumulating **data orchestration**, extract that into a colocated custom hook (or a view component) — keep the page thin. See `component-organization.md`.

## Reference (progressive disclosure)

Read the file that matches the decision in front of you:

- **`folder-structure.md`** — layout strategies (flat → by-type → feature-based → FSD, and Atomic Design), colocation, naming conventions, where constants/config live, and the `utils` vs `helpers` question. Includes the methodology comparison + "when to choose".
- **`component-organization.md`** — when a component earns its own file (SRP, composition), the presentation/logic/network layer split, and extracting business logic into hooks — the *organizational* angle.
- **`nextjs-organization.md`** — Next.js App Router structure: server/client boundaries as a colocation concern, `_private` folders, route groups, `src/`, and where data-fetching / server actions / the api layer live.
- **`README.md`** — this skill's focus, coverage boundaries, target cases, the "who owns what" table vs sibling skills, version/changelog, and all research sources.

## Red flags (quick self-check)

- Adding an `index.ts` barrel inside an app folder → breaks tree-shaking; import directly.
- Splitting a component because it "feels big" → premature; wait for a concrete problem.
- One feature importing from another → coupling; lift the shared piece down.
- `fetch`/business logic sitting in a component → move to a hook + api layer.
- Scaffolding deep empty layers up front → grow structure on demand.
- Copying server data into Context/state → the query cache is the source of truth.
- No route-level `error.tsx` → a render throw becomes a white screen (hand-rolled `isError` doesn't catch it).

## Related skills (boundaries)

| This skill | Sibling skill | Boundary |
|---|---|---|
| *Where* code lives & how it's laid out | **`react-best-practices`** | *How* to write components/hooks/state; split thresholds, hook misuse, perf → there |
| Structural view of App Router | **`next-best-practices`** | RSC data patterns, route handlers, caching mechanics → there |
| Placement, not verification | **`react-testing-library`** | Testing the placed code → there |
| Folder decisions | **`typescript-expert`** | Type-level programming, path-alias/monorepo mechanics → there |

Reference other skills by name (as above) — do not `@`-link them.
