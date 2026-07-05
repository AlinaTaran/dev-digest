# Folder structure, naming & shared code

Layout strategies, colocation, naming, where constants live, and the `utils` vs `helpers` question. Applies principles 1–3 and 6 from `SKILL.md`.

## Layout strategies (pick by scale)

Structure is a progression — adopt the lightest one that fits, and grow only when a folder gets busy.

| Strategy | Shape | Good for | Cost |
|---|---|---|---|
| **Flat** | everything in `src/` (or a couple of files) | prototypes, tiny apps | breaks down fast |
| **By type** | `components/`, `hooks/`, `utils/`, `pages/` | small apps; the React default | related code scatters as it grows |
| **Feature-based** | `features/<feature>/` each with its own `components/hooks/api/model/types`, plus a shared root | **most apps — the pragmatic default** | needs discipline on the shared/promote rules |
| **Feature-Sliced Design (FSD)** | formal layers → slices → segments | large, long-lived, multi-team apps | high upfront cost |

Cross-cutting rules regardless of strategy:
- **Start flat, grow into features.** Don't scaffold `features/x/components/ui/…` with one file inside. Nesting for its own sake hurts.
- Keep nesting **≤ ~2 levels** deep.
- **Domain vs generic:** single-use domain components live in the feature; reusable presentation-only UI lives in a top-level `components/`.
- **Promotion rule:** a component/hook/util moves up to shared **only when a 2nd feature needs it**.

### Feature-based (Bulletproof React shape)
```
src/
  components/        # generic, reusable UI (used by many features)
  hooks/  lib/  utils/  config/  types/   # truly shared
  features/
    invoices/
      components/  hooks/  api/  model/  types/  utils/   # only what this feature needs
```
Dependencies flow **`shared → features → app`**; features **don't import each other** (enforceable with ESLint). Compose features at the app/page level.

### Feature-Sliced Design (FSD)
Three levels: **Layers → Slices → Segments**.
- **Layers (current spec):** `app · pages · widgets · features · entities · shared`.
  - ⚠️ Older articles list a `processes` layer — it is **deprecated** (fold into `features`/`app`), and they omit `widgets` ("large self-sufficient blocks of UI"). Not every layer is mandatory.
  - Import rule: a module may import only from layers **strictly below** it.
- **Slices:** partition a layer by business domain. **Same-layer slices cannot import each other** — if two need something, it belongs in a lower layer.
- **Segments** (inside a slice): `ui` (view), `model` (state + business logic + types), `api` (network), `lib` (helpers), `config`. Name segments by **purpose**, not `components`/`hooks`.
- Each slice exposes a **public API** via `index.ts`; consumers import from the slice root, never its internals. (This is the *one* place a barrel earns its cost — see below.)

### Atomic Design — UI layer only
`atoms → molecules → organisms` classifies **UI by visual granularity**. It says **nothing about business logic**, so it's "necessary but insufficient" alone. Best used *inside* the UI layer of another strategy (`shared/ui`, or a slice's `ui`), not as the whole app's structure.

**Recommended framing:** feature-based (or FSD at scale) for domain structure **+** Atomic Design inside the UI layer. Complementary, not competing.

## Colocation

Keep files next to where they're used; lift to shared only on reuse (principles 2–3). Colocation keeps a change local: the component, its styles, its test, and its single-use helper move together.

## Barrel / `index.ts` files

**Avoid barrels in application directories.** Re-export `index.ts` files:
- break bundler **tree-shaking**;
- force synchronous loading of the whole directory (documented Next.js case: **~11k → ~3.5k modules, −68%**, and multi-second startup savings after removal);
- readily create **circular imports** that crash bundlers;
- disable Next's `optimizePackageImports` the moment they contain one non-re-export line.

**Justified barrel:** a *library's* single public entry point, or an **FSD slice / feature public API**. Everywhere else, import files directly.

**The criterion — is this folder a boundary?** A barrel is justified **only** when the folder is a real boundary consumed from **outside** by **multiple callers** through a curated public surface (a library, or a feature/slice with several exports). A folder wrapping a **single component** is **not** a boundary — import the component file directly (`AgentEditor/AgentEditor.tsx`, not `AgentEditor/index.ts`). Quick test: **if the barrel re-exports one thing, delete it.**

**Migrating a repo already on per-component barrels:** it's a **mechanical sweep** — delete each `index.ts`, repoint its imports to the concrete file. Do it as **one focused pass**, not opportunistically. The tree-shaking / dev-startup payoff is most material in **large apps** and when relying on `optimizePackageImports`.

## Constants / config / enums

- Extract static arrays/objects to **module-level constants** rather than recreating them inline. *(For the inline-JSX rule itself, that's `react-best-practices`; here we care about placement.)*
- Feature-wide or app-wide constants/enums/flags → a dedicated **`config/`** folder (FSD's `config` segment).
- **This repo** keeps such values in flat `src/lib/` files rather than a `config/` folder — follow the existing placement here rather than introducing a new convention.

## `utils` vs `helpers`

There's no universal hard definition — **don't argue the two words. Decide by scope, not name:**
- Used by one component → **colocated** (in the file, or an adjacent `utils.ts`).
- Used by 2+ features → promote to a shared **`utils/` or `lib/`**.
- **Domain logic** belongs in the feature's `model`, *not* a generic `utils` bucket.

**This repo:** shared utilities are flat files in `src/lib/` (e.g. `format.ts`, `github-urls.ts`); there is **no `utils` vs `helpers` split**, and that's fine — consistency beats taxonomy.

## Naming

- **Case by kind (the rule that resolves the two conventions here):** **React components and their folders use PascalCase** (`AgentEditor/AgentEditor.tsx`); **routes, non-component folders, and shared non-component utilities use kebab-case** (`repo-not-found/`, `github-urls.ts`). This is why `_components/<Feature>` in `nextjs-organization.md` is PascalCase and a `lib/` util is kebab — same rule, different kind of thing.
- Keep folder/file names **singular** (`features/customer`, `customer-list`), whichever case applies.
- Name folders by **purpose** (`ui`, `api`, `model`) once you adopt a layered scheme — avoid generic `components`/`hooks` segment names.
- Optional suffixes for intent: `*.data.ts`, `*.test.ts`, `*.types.ts`.
