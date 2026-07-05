# Skills feature — implementation plan

Reusable Markdown instruction blocks ("skills"), edited in a dedicated tabbed studio and
attached (in order) to review agents. At review time an agent's enabled + attached skills are
appended to the assembled prompt as a distinct, order-preserving block, visible with its token
cost in the run trace.

## Context

Agents today = provider + model + system prompt + output schema. Skills add reusable,
cross-agent instruction blocks. The feature is **heavily pre-scaffolded** — reuse as-is:

- **DB tables** `skills`, `skill_versions`, `agent_skills` (with `order`) already exist in the
  schema and `0000_init.sql`. **No new migration needed.**
- **Zod contracts** `Skill`, `SkillType` (`rubric|convention|security|custom`), `SkillSource`
  (`manual|imported_url|extracted|community`), `AgentSkillLink` —
  `server/src/vendor/shared/contracts/knowledge.ts:114-199` (mirrored client-side).
- **Agent-side link CRUD** already exists: `AgentsRepository.linkedSkills / setSkills /
  linkSkill` (`server/src/modules/agents/repository.ts:191-235`); routes
  `GET/POST /agents/:id/skills`.
- **Engine** already accepts `skills?: string[]`, renders a `## Skills / rules` block, and
  records `PromptAssembly.skills` (`reviewer-core/src/prompt.ts:88-89,109,131`); the run-trace
  UI already renders a skills block.
- **i18n**: `client/messages/en/skills.json` + `agents.json` `skills.*` /
  `editor.tabs.skills`. **Nav** active-key mapping for `/skills` already present
  (`client/src/components/app-shell/helpers.ts:33`).

## Confirmed scope

- **Import: file only** — `.md` or `.zip`. `POST /skills/import` takes JSON
  `{ filename, content_base64 }` (client base64-encodes; no multipart). Server extracts the
  skill core (name/description/type/body); executable/script files are listed as ignored and
  **never run**. Save happens on a separate confirm (`POST /skills`).
- **Skill editor = 5 tabs on `/skills/[id]`, mirroring the Agent editor:**
  - **Config** — full: name, description (directive-interface hint), type, Markdown **body
    editor** (mono, line-number gutter, `{name}.md` header, "unsaved" badge, live approx token
    count), Enabled toggle, version badge, Save.
  - **Preview** — full: renders body as Markdown ("Rendered as the reviewing agent receives it").
  - **Versions** — full: history from `skill_versions` + client-side **Diff** + **Restore**
    (PUT old body → new version).
  - **Stats** — **only DB-derivable data**: USED BY (count of linked agents), AGENTS USING THIS
    SKILL (list), FINDINGS BY CATEGORY (counts across the linked agents' reviews). No
    pull/accept analytics.
  - **Evals** — **stub** "coming soon" (Run-on-evals button hidden).
- **Skill card**: name, type badge, source badge, description, Enabled toggle, **only "N
  agents"** (real, from `agent_skills`).
- **One new agent** — Test Quality Reviewer — with 3–4 skills (drop the API Contract agent).
- **Prompt trust**: `source:'manual'` skills injected as trusted text; imported
  (`source:'extracted'`) skills wrapped in `<untrusted source="skill:…">…</untrusted>` and
  created **disabled** (vet-before-enable).
- **Nav**: add a **SKILLS LAB** section with **Skills** (icon Sparkles) + move Agents into it.
  The rest of the mockup's nav is **out of scope** (other lessons; no dead links).
- **Setup**: seed the agent + its 3 manual skills; import the 4th live in the UI.

## API route map

**Backend — new `skills` module** (`server/src/modules/skills/routes.ts`):

| Method | Path | Does |
|---|---|---|
| GET | `/skills` | List skills in workspace (each with `agent_count`) |
| GET | `/skills/:id` | One skill |
| POST | `/skills` | Create (manual, or confirm an import) → 201 |
| PUT | `/skills/:id` | Update; **body change → new immutable version** |
| DELETE | `/skills/:id` | Delete (cascades versions + agent links) |
| GET | `/skills/:id/versions` | Version history (with body for diff/restore) |
| GET | `/skills/:id/stats` | `{ used_by, agents:[{id,name}], findings_by_category:[{category,count}] }` |
| POST | `/skills/import` | JSON `{filename, content_base64}` (.md/.zip) → **unsaved** preview `{name,description,type,body,source:'extracted',ignored[]}` |

**Backend — reused (no change):** `GET /agents/:id/skills`, `POST /agents/:id/skills`
(`{ skill_ids }` set/reorder).

**Client hooks** (`client/src/lib/hooks/skills.ts`, via `src/lib/api.ts`): `useSkills`,
`useSkill`, `useCreateSkill`, `useUpdateSkill`, `useDeleteSkill`, `useSkillVersions`,
`useSkillStats`, `useImportSkill` (file → base64 → POST JSON), `useAgentSkills`,
`useSetAgentSkills`.

## Server — new `skills` module (mirror `agents`)

New `server/src/modules/skills/{routes,service,repository,helpers,constants}.ts`, copying the
agents module shape (workspace-scoped, `getContext`, `withTypeProvider<ZodTypeProvider>`,
snake_case bodies, `IdParams`).

- **`db/rows.ts`**: add `SkillRow` / `SkillVersionRow` (`typeof t.skills.$inferSelect`).
- **`helpers.ts`**: `toSkillDto(row)` (like `toAgentDto`); `extractSkillCore(filename, buf)`.
- **`repository.ts`** (`SkillsRepository(db)`): `list` (join `agent_skills` for `agent_count`),
  `getById`, `insert` (snapshot v1), `update` (bump version + snapshot **only when body
  changed**; name/description/type/enabled do not bump), `deleteById`, `listVersions/getVersion`,
  `stats` (linked agents + findings-by-category via `agents→reviews→findings`). Reuse the
  `snapshotVersion` idiom (`agents/repository.ts:148-167`).
- **`service.ts`** (`SkillsService`): `list/get/create/update/delete/listVersions/stats/
  importFromFile`. Create → `source:'manual', enabled:true`; import-confirm → `source:'extracted',
  enabled:false`.
- **Register** in `server/src/modules/index.ts` (+1 import, +1 entry).

**Import extraction** (pure helper): route decodes `Buffer.from(content_base64,'base64')`; add
dep `fflate` (pure-JS unzip). `.md` → parse minimal frontmatter / first heading + body; `.zip`
→ `unzipSync`, read only `SKILL.md` (or first `*.md`), push all other entries to `ignored[]`
(reported, never executed). No shell/eval/fs.

## reviewer-core

Trust wrapping is application-layer, done in the server. Ensure `wrapUntrusted` is re-exported
from `reviewer-core/src/index.ts` (`prompt.ts:30`).

## Server — wire skills into the review run

`server/src/modules/reviews/run-executor.ts` `runOneAgent`, before `reviewPullRequest` (~:190):

```ts
const linked = await this.agents.linkedSkills(agent.id);
const skillBodies = linked
  .filter((l) => l.skill.enabled)                                  // disabled → absent
  .map((l) => l.skill.source === 'manual'
    ? l.skill.body
    : wrapUntrusted(`skill:${l.skill.name}`, l.skill.body));       // imported → fenced
```

then `...(skillBodies.length ? { skills: skillBodies } : {})` on the call. Order preserved
(order ASC); enabled-only filter gives "enabled skill in logs, disabled not". Engine fills the
block + `assembly.skills`; trace persists it.

## Client

**Mirrors agents 1:1** (master-detail + tabbed editor):

- Hooks `client/src/lib/hooks/skills.ts` (above), re-exported from `hooks/index.ts`.
- `app/skills/page.tsx` — `SkillsRail` (left) + "Select a skill" prompt.
- `app/skills/[id]/page.tsx` — mirrors `agents/[id]/page.tsx`: `SkillsRail` + header + `SkillEditor`;
  `?tab=`, `VALID_TABS=["config","preview","versions","stats","evals"]`.
- `_components/SkillsRail/` — filter input + **Add Skill ▾** (Create / Import) + `SkillCard`
  (clone `AgentCard`; source badge + needs-vetting when `source!=='manual'`; "N agents").
- `_components/SkillEditor/` — `Tabs` driving `ConfigTab` (clone agent `ConfigTab` +
  `SkillBodyEditor`), `PreviewTab` (`<Markdown>`), `VersionsTab` (Diff + Restore), `StatsTab`
  (`useSkillStats`; follow the `dataviz` skill for any chart), `EvalsTab` (placeholder).
- `_components/CreateSkillModal/` (clone `CreateAgentModal`) and `_components/ImportSkillDrawer/`
  (reuse `kit/Drawer.tsx`, "From file" tab only; preview + `ignored[]` list → Confirm).

**Agent editor Skills tab:** append to `TABS` (`AgentEditor/constants.ts`), branch in
`AgentEditor.tsx`, add `"skills"` to `VALID_TABS` (`agents/[id]/page.tsx`), new
`AgentEditor/_components/SkillsTab/`: all workspace skills with attach checkbox + native HTML5
drag-reorder → `useSetAgentSkills({ skill_ids })`; header "N of M enabled" + per-skill approx
tokens.

**Nav** (`client/src/vendor/ui/nav.ts`): add SKILLS LAB group = Skills (Sparkles, `/skills`,
`g s`) + Agents. Other mockup nav items out of scope.

**i18n**: extend `client/messages/en/skills.json` with `editor.tabs`, `config.*` (+ directive
hint), `versions.*`, `stats.*`, `evals.comingSoon`, `card.agentCount`.

**Trace**: show skills-block approx token count in `RunTraceDrawer/.../TraceBody.tsx`.

## Seed (reproducible experiment)

`server/src/db/seed.ts` + `seed-prompts.ts`: add `TEST_QUALITY_REVIEWER_PROMPT`; upsert agent
**Test Quality Reviewer**; upsert 3 manual skills (`branch-coverage-gate` rubric,
`corner-case-checklist` convention, `mock-overuse-gate` custom), each with `skill_versions` v1;
link with `order=index`; add fixture `SKILL.md` + `.zip` (with a dummy `scripts/run.sh`) for the
live 4th-skill import; optionally a happy-path-only-test PR for the experiment.

## Files

**Create:** `server/src/modules/skills/{routes,service,repository,helpers,constants}.ts`;
`client/src/lib/hooks/skills.ts`; `client/src/app/skills/page.tsx` + `skills/[id]/page.tsx` +
`_components/{SkillsRail,SkillEditor,CreateSkillModal,ImportSkillDrawer}/`;
`client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/`.

**Modify:** `server/src/modules/index.ts`; `run-executor.ts`; `server/src/db/rows.ts`;
`server/src/db/seed.ts` + `seed-prompts.ts`; `reviewer-core/src/index.ts`;
`server/package.json` (+fflate); `client/src/vendor/ui/nav.ts`;
`AgentEditor/constants.ts` + `AgentEditor.tsx` + `agents/[id]/page.tsx`;
`client/messages/en/skills.json`; `RunTraceDrawer/.../TraceBody.tsx`.

## Verification

1. `cd server && pnpm db:migrate && pnpm db:seed`; `./scripts/dev.sh`.
2. Typecheck all three packages; server unit `pnpm exec vitest run --exclude '**/*.it.test.ts'`,
   `pnpm test` (client), `npm test` (reviewer-core), `pnpm exec depcruise` (onion gate). Add
   tests: `extractSkillCore` (md/zip/ignored), `SkillsRepository.update` version-bump-on-body,
   `stats`, run-executor trust-wrap, RTL for ConfigTab/ImportSkillDrawer/VersionsTab/SkillsTab.
3. UI: create + edit a skill (version bumps), Diff/Restore, import `.zip` (preview + ignored
   scripts, saved disabled), attach/reorder on the agent Skills tab, Stats tab populated.
4. Run a review → run trace → `## Skills / rules` block in order with token count; disable a
   skill → it disappears next run.
5. Control experiment: Test Quality Reviewer skills off (miss) vs on (flags uncovered branch).
6. Trust: imported skill body renders inside `<untrusted source="skill:…">`.
7. `/pr-self-review` before pushing; resolve CRITICAL findings.
