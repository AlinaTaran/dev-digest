# client — INSIGHTS

Append-only log of decisions, gotchas discovered, and lessons for the web app.
Newest first. Capture what wasn't obvious from the code — the "why" behind a choice,
or a trap someone hit — so the next person (or agent) doesn't relearn it.

## What Works

- **`formatCost` 3 sig figs for sub-cent** — use `Math.floor(Math.log10(usd))` to get the leading digit's magnitude, then `dp = -magnitude + 2` for exactly 3 significant figures. Don't strip trailing zeros for sub-cent amounts — they're significant. Only strip for `$0.01–$0.99` range.

- **Hover popovers must portal to `document.body` + `position: fixed`** — the new generic `HoverCard` (`vendor/ui/kit/HoverCard.tsx`) measures the trigger via `getBoundingClientRect()` and renders the card through `createPortal`. Absolute positioning inside the PR-list table / timeline rows gets clipped by row `overflow`, so don't reach for the click-based `Dropdown` (which uses `position:absolute`) for hover previews. Close on a ~120ms delay (on both trigger and card `mouseleave`, cleared on re-enter) so the pointer can travel into the card to click the `file:line` links; close on scroll/resize to avoid a stale fixed position.

- **Line-numbered "code editor" = disable soft-wrap, sync the gutter's `scrollTop`** — `vendor/ui/kit/CodeTextarea.tsx` puts a fixed-width number gutter next to a real `<textarea>`. The trap is soft-wrap: a wrapped logical line occupies 2+ visual rows and the 1:1 gutter numbering desyncs. Fix is `wrap="off"` + `whiteSpace:"pre"` on the textarea (one logical line = one visual row; long lines scroll horizontally), and mirror the textarea's vertical scroll onto the gutter via `onScroll → gutterRef.scrollTop = ta.scrollTop`. Gutter + textarea must share identical `fontSize`/`lineHeight`/top-padding or the numbers drift. It stays a controlled `<textarea value/onChange>`, so `getByDisplayValue` RTL tests keep working — the ConfigTab test needed no change when swapping `Textarea`→`CodeTextarea`.

## Session Notes

### 2026-06-30 — formatCost precision fix
- Changed sub-cent branch from `toFixed(4)` (gives 1 sig fig for $0.000717) to log10-based dynamic dp (gives "$0.000717", "$0.000915" — 3 sig figs). The ≥$0.01 branch keeps trailing-zero stripping.

## What Doesn't Work

- **A single flex-wrap row mixing a title with secondary metadata (edit icon, tag) gives inconsistent gaps depending on title length.** `ConventionCandidateCard`'s header originally put the rule title, an edit `IconBtn`, and a category tag all in one `flexWrap: "wrap"` container with a uniform `gap`. It looked fine for a short one-line title but looked cramped for a long title that wrapped to 2 lines — the metadata row that wrapped underneath only got the same small inline `gap` as spacing from the paragraph above, not a real margin. Fix: don't rely on wrap behavior for visually-distinct rows — split into an explicit column (`titleCol` → `titleRow` + `metaRow`, each its own flex row) with a real `gap` between them, so spacing is consistent no matter how many lines the title takes.

- **A capture-phase `window` scroll listener that closes a popover will block scrolling INSIDE it** — `HoverCard` closes on page scroll to avoid a stale `position: fixed`, but with `addEventListener("scroll", …, true)` the handler also fires for wheel-scrolls of the card's own inner list, instantly closing it. Guard with `if (cardRef.current?.contains(e.target)) return;` so only page scrolls close the card.

- **`ConventionCandidateCard`'s evidence `path:line` is rendered via `MonoLink` with NO `href`** — it degrades to a plain non-clickable button showing text only. `client/src/lib/github-urls.ts#githubBlobUrl` already exists and is used by `FindingCard`/`FindingsPopover` to build a clickable GitHub blob+line URL for PR-review findings, but nothing wires the same helper into the conventions candidate card. If the acceptance criterion is "clicking a candidate's evidence opens the real file on GitHub," this currently does NOT work — pass a `githubBlobUrl(...)` result as `MonoLink`'s `href` (needs repo owner/name + ref, not just path/line, which the candidate's evidence fields don't currently carry — check what `ConventionCandidate` needs added).

- **`ConventionCandidateCard`'s left border is intentionally always `var(--ok)` (green), NOT status-driven** — `styles.ts`'s `card()` used to color it by status (`accepted → var(--ok)`, `rejected → var(--text-muted)`, `pending → var(--border-strong)`), which looks like the "obviously correct" design (status at a glance) and matches how the Accept/Reject buttons still work (kind switches to `primary`/`secondary` per status). Explicit user design call: keep the border always green regardless of status — don't reinstate the status-color branching, that reverts a deliberate decision, not a bug fix. `card()`'s signature dropped its `accepted` param accordingly (now just `card(rejected: boolean)`, `rejected` still drives the dimmed opacity).

## Codebase Patterns

- **`FindingsPopover` is shared by the PR list and the detail timeline** — it lives at `app/repos/[repoId]/pulls/_components/FindingsPopover/` (the parent `pulls/` route, so both the list `page.tsx`/`PRRow` and the nested `[number]/_components/RunHistory` import it). It takes `findings: Finding[]`; `FindingRecord[]` (timeline reviews) is structurally compatible, so pass it directly. The timeline's per-run findings come for free from the already-loaded `usePrReviews` data — `FindingsTab` builds `findingsByRun` (`run_id → review.findings`) and threads it into `RunHistory`, which falls back to the old "N findings · M blockers" text when a run has no matching review (failed/running).

- **To make a whole row a hover trigger but anchor the card elsewhere, separate the hover area from the anchor** — `HoverCard` supports `block` (wrapper is a full-width `div`, so an entire timeline row is the hover area) + `anchorRef` (a ref to a child, e.g. the severity badges, used for `getBoundingClientRect` positioning). The timeline's `RunRow` (extracted so each row can own a `badgesRef`) wraps the whole row and points `anchorRef` at the badges. NOTE: you can't show a hover-highlight by tinting the `block` wrapper — the row's own `--bg-elevated` is opaque and sits on top; highlight the row element itself if needed. The non-`block` (inline `span`) mode keeps the plaque highlight for the PR-list badges.

- **`AppFrame`'s `<main>` (`vendor/ui/shell/AppFrame.tsx`) has zero padding by design** — every top-level page view is responsible for its own page-level padding, not the shell. The convention (see `AgentsListView`'s `s.page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" }`) is to wrap the page's root JSX in a `page` style from the view's own `styles.ts`. `ConventionsView` was scaffolded without this wrapper, so its content rendered flush against the viewport edge (no gutters) even though its layout otherwise matched sibling pages — easy to miss because nothing errors or looks obviously broken until compared side-by-side with another page. When adding a new top-level page under `app/**/_components/<View>/`, copy the `s.page` wrapper pattern rather than assuming `AppShell`/`AppFrame` supplies it.

- **`ConventionsView`'s candidate list is a persistent checklist, not a processing queue — accepted/rejected cards deliberately stay visible, never filtered out.** `list.map(...)` renders every candidate regardless of `status`; only at "Create skill" time does `acceptedCandidates = list.filter(c => c.status === "accepted")` get pulled out for the modal. This is intentional per `docs/conventions-extractor-plan.md`'s Track 1 description ("approve / reject / edit / re-scan / **deselect-all**") — the "Deselect all" toolbar button bulk-resets every non-pending card back to `pending`, which only makes sense if accepted/rejected cards remain visible and re-toggleable up until you actually generate the skill. Don't add filtering/hiding for accepted or rejected candidates in the main list — that would break the ability to review/reverse decisions via Deselect all (or per-card, by re-clicking Accept/Reject) before finalizing.

## Tool & Library Notes

- **Evenly-spaced round dotted underline** (severity-coloured leader under the findings badges) is a `radial-gradient(circle, COLOR 1.1px, transparent 1.6px)` with `backgroundSize: "5px 2px"`, `backgroundRepeat: "repeat-x"`, `backgroundPosition: "left bottom"` — NOT `border-bottom: dotted`, whose dots render as chunky touching squares. Set `background: transparent` first (bare badge) then the gradient via `backgroundImage` (later key wins over the shorthand's image reset). See `SeverityBadge underline` in `vendor/ui/primitives/Badge.tsx`.

- **`Icon` names are the map keys in `vendor/ui/icons.tsx`, NOT the raw lucide export names.** The map aliases some: e.g. `Edit: Pencil` — so the valid `IconName` is `"Edit"`, and `<Badge icon="Pencil">` fails typecheck (`TS2322`). When picking an icon, grep the object keys in `icons.tsx` (the `satisfies Record<string, LucideIcon>` block) rather than assuming lucide's name is exported.

- **`Donut` (`vendor/ui/charts/Donut.tsx`) defaults its legend to a dollar amount** (`${valuePrefix}${n.toFixed(2)}`, `valuePrefix="$"`). For integer/count legends (e.g. findings-by-category), pass `format={(n) => String(n)}` — a `format?: (n:number)=>string` prop overrides the money formatting without touching existing cost callers.

- **`Button`'s `active` prop only has a visual effect for `kind="tertiary"`** (`vendor/ui/primitives/Button.tsx`) — the `secondary`, `ghost`, `primary`, and `danger` style maps never read `active` at all, so `<Button kind="secondary" active={someBoolean}>` silently renders identically whether `someBoolean` is true or false. `ConventionCandidateCard`'s Accept/Reject buttons passed `active={accepted}`/`active={rejected}` with `kind="secondary"`/`kind="ghost"` and had zero visual state feedback as a result (only the card's left border color changed). Fix is to switch `kind` itself based on state (e.g. `kind={accepted ? "primary" : "secondary"}`) rather than relying on `active` — or extend the style maps if you actually want `active` to do something for those kinds.

- **`ConventionCandidateCard`'s Accept/Reject buttons are intentionally asymmetric in color, not a leftover bug.** Accept escalates to `kind="primary"` when `accepted` (the only kind with a filled `var(--accent)`/blue background per `Button.tsx`'s style map), while Reject only ever toggles between `"ghost"` (not rejected) and `"secondary"` (rejected) — it never reaches `"primary"`, so it never gets a colored fill, only a neutral gray outline/fill. Don't "fix" Reject to also turn blue when accepted-style-symmetry looks broken — Accept is deliberately the only button that carries the accent color, since it's the path toward the primary next action (bundling into a skill); Reject is modeled as a neutral/muted state. (The card's left border, separately, is always `var(--ok)` green regardless of status — see the entry below — only `opacity` in `styles.ts#card(rejected)` changes with status.)

## Recurring Errors & Fixes

- **`GET/POST /agents/:id/skills` returns bare `AgentSkillLink` rows (`{ agent_id, skill_id, order }`), NOT a joined `{ skill: Skill, order }`.** It's easy to assume otherwise because the server-side `AgentsRepository.linkedSkills()` *does* return a joined `LinkedSkillRow` (`{skill, order}`) — but the route (`agents/routes.ts`) calls `service.skillLinks()`, which maps to the public `AgentSkillLink` DTO (already in `@devdigest/shared`), i.e. ids only. A mocked-fetch hook test using the wrong (joined) shape will pass green while the real endpoint silently returns `undefined` for `.skill.id`/`.skill.enabled` at runtime — caught only by hitting the live API (`curl localhost:3001/agents/:id/skills`), not by typecheck or the component's own RTL test. If you need the full `Skill` for a link row, look it up by `skill_id` against an already-fetched skill list (e.g. `useSkills()`) — see `SkillsTab.tsx`'s `byId` map.

## Session Notes

### 2026-06-30 — INSIGHTS log started
**Decision:** Track per-package learnings here, referenced from `client/CLAUDE.md`.
**Why:** `CLAUDE.md` is a thin map; durable history belongs in a lazy-loaded file.
**Consequence:** Add an entry whenever a non-obvious decision or gotcha lands.

### 2026-07-03 — Skills Lab UI (multi-agent build)
- Added `app/skills/**` (list + detail, mirrors `agents/` 1:1: rail + 5-tab editor —
  Config/Preview/Versions/Stats/Evals-stub), `CreateSkillModal`, `ImportSkillDrawer`
  (file-only import → preview with `ignored[]` list → confirm as disabled `extracted`),
  the Agent Editor's new Skills tab (attach/reorder), a SKILLS LAB nav group, and
  `lib/hooks/skills.ts`. Built by parallel agents against a pinned API contract written
  ahead of time — worked well for the endpoints that were genuinely new, but see the
  Recurring Errors entry above: for an endpoint that already existed (`/agents/:id/skills`),
  re-verify its actual shape from the route/service code (or a live `curl`) rather than
  inferring it from a same-named repository method one layer down.

### 2026-07-03 — barrel convention removed; route error boundaries added
**Decision:** Dropped the repo's old per-component barrel convention. Removed ~37 single-component `index.ts` re-export files under `app/**/_components/**` and `components/diff-viewer/*`; components are now imported from the concrete file (`./Foo/Foo`, not `./Foo`).
**Why:** a barrel that re-exports one component is not a boundary — it only hurts bundler tree-shaking / dev startup. (Codified in the `frontend-architecture` skill v1.1.0.)
**Keep barrels ONLY at genuine shared-library boundaries:** `components/diff-viewer/index.ts` (public API: `DiffViewer` + `DiffCommentApi`) and `components/app-shell/index.ts` (+ its `hooks/index.ts`). **Do not add a per-component `index.ts` for a new component** — import its file directly, or you reintroduce the anti-pattern.

**Also this session:**
- **Route-level error boundaries now exist** — `app/error.tsx`, `app/not-found.tsx`, `app/repos/[repoId]/pulls/[number]/error.tsx` (keys under `common.errorBoundary` / `common.notFound`). Hand-rolled `isError` branches do NOT catch render-time throws; add an `error.tsx` for any new route that can throw in its subtree.
- **Reset-form-on-prop-change → use `key` remount, not a `useEffect`.** `ConfigTab` seeds 9 `useState` from the `agent` prop; the parent renders `<ConfigTab key={agent.id} …>` so switching agents remounts and re-seeds. Don't re-add a resync effect.
- **`components/mermaid-diagram/` is currently unreferenced (0 importers)** — left in place pending the knowledge feature; don't assume it's wired anywhere.

### 2026-07-03 — Skills Lab visual pass (match design)
- Aligned Skills Lab visuals to the re-sent design under two hard constraints: **no Evals impl**
  (kept the stub, no "Run on evals" button) and **DB-only stats**. The design's PULL FREQUENCY /
  ACCEPT RATE / FINDINGS (30D) tiles and per-version titles have **no backing data** — confirmed
  `SkillStats = { used_by, agents[], findings_by_category[] }` and `SkillVersion = { skill_id,
  version, body, created_at }` (no accept/pull fields, no version `note`). Dropped them rather than
  faking values. StatsTab is now MetricCard tiles (USED BY, total FINDINGS) + an agents card +
  a findings-by-category `Donut` (integer `format`); VersionsTab got a count badge/subtitle and
  per-row Diff(on-demand)/Restore. Added the reusable `CodeTextarea` (see What Works) for the
  Config body. Tab order set to Config/Preview/Evals/Stats/Versions per design.
- **Couldn't do a browser screenshot verification** — the `claude-in-chrome` MCP tools were not
  available this session (only Figma MCP loaded). Fell back to: typecheck, full `pnpm test` (42/42),
  and curling each `/skills/:id?tab=…` route (200, no error markers) + the stats/versions APIs to
  confirm real data. For a true visual diff you need the Chrome tools or manual eyeballing.

### 2026-07-04 — Conventions Extractor UI (Track 1)
- Added `app/conventions/**` — a GLOBAL page (`/conventions`, no `[repoId]` URL segment) mirroring `/skills`/`/agents` rather than the repo-scoped `pulls` pattern, even though the feature is conceptually repo-scoped: `repoId` comes from `useActiveRepo()` context (URL > localStorage > first repo), not `useParams`. Confirmed via `nav.ts`'s bare `href: "/conventions"` and the existing `messages/en/conventions.json`'s `page.headingPrefix: "Conventions in "` scaffolding — a repo-scoped `/repos/[repoId]/conventions` route would have been the more "obvious" choice but is NOT what the scaffolding/plan intended.
- `nav.ts` needed a new entry inside an in-progress, uncommitted "SKILLS LAB" group from separate unrelated work — see `server/INSIGHTS.md`'s git-commit-hygiene entry for the split-commit recipe this required (recurred on 3 files across this feature).
- `client/src/lib/hooks/skills.ts`'s `CreateSkillInput` doesn't model `evidence_files` even though the wire contract (`Skill` in `knowledge.ts`) has it — the conventions-extractor's "bundle into skill" modal is its second real consumer needing that field, and had to widen the type per-call-site (`CreateSkillInput & { evidence_files: string[] }`) instead of fixing the shared interface, because `hooks/skills.ts` itself is part of a separate, entirely uncommitted feature not owned by this task. Worth fixing for real once that file is committed and shared history exists.
- Couldn't verify visually via `claude-in-chrome` (not available this session either) — verified via typecheck, full `pnpm test`, and driving the real API end-to-end against a live cloned repo (extract → accept/reject → re-scan-preserves-accepted → create skill), all through curl since the browser tools weren't loaded.

### 2026-07-04 — `buildBodyMarkdown` slug collision (pr-self-review lens finding, unfixed)
- **`CreateSkillFromConventionsModal/helpers.ts`'s `buildBodyMarkdown` keys each candidate's section by `slugifyRule(rule)` with no dedup.** Nothing upstream (`conventions/service.ts`, `repository.ts`, the DB schema) enforces unique rule text across candidates from one extraction run, so two accepted candidates with the same (or same-slugifying) rule produce two identical `## <slug>` headings back to back in the generated skill body. Not caught by `helpers.test.ts` because its fixtures only ever use distinct rule strings. Needs a suffix/merge step before this ships.

## Open Questions
