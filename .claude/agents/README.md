# Custom agents

Project-scoped Claude Code subagents for DevDigest. Each agent is a single Markdown file
with YAML frontmatter (`name`, `description`, `model`, `tools`, and optionally `skills:`)
plus a body of hard rules and a fixed output shape. They're checked into version control so
the whole team shares them.

| Agent | Purpose | Model | Writes code? |
|---|---|---|---|
| [`researcher`](./researcher.md) | Read-only information finder (project codebase or web), returns a structured, honestly-assessed result. | `sonnet` | No |
| [`planner`](./planner.md) | Read-only architect → emits a structured **Development spec** (`docs/spec/<slug>.md`) that decomposes work into parallelizable, file-disjoint tasks. | `opus` | No (only the spec artifact) |
| [`implementer`](./implementer.md) | Implements **one** task from a spec (backend *or* UI), runs in parallel, self-verifies with the module's tests + typecheck. | `sonnet` | Yes |
| [`test-writer`](./test-writer.md) | Writes automated tests for any module — client (RTL/jsdom), server (vitest unit + `*.it.test.ts`), reviewer-core, and e2e flows. Writes **test files only**. | `sonnet` | Tests only |
| [`architecture-reviewer`](./architecture-reviewer.md) | Read-only **architectural** review — onion/layering, boundary/port leakage, coupling, reviewer-core purity, frontend structure. Not line-level bug/style hunting. | `opus` | No |
| [`plan-verifier`](./plan-verifier.md) | Read-only **requirement-coverage** check: verifies every requirement / acceptance criterion of a plan or dev spec was actually delivered, with file evidence + a real test re-run. | `opus` | No |
| [`doc-writer`](./doc-writer.md) | Generates/maintains documentation (+ Mermaid diagrams) — describes shipped features, converts plans into docs. Writes **docs only**. | `sonnet` | Docs only |

## The full agent loop

The seven agents compose into one end-to-end loop; the middle two (`planner`/`implementer`)
are the orchestrator-worker core, the rest wrap around them:

```
researcher → planner → implementer → test-writer → architecture-reviewer / plan-verifier → doc-writer
```

`test-writer` writes the tests a slice needs, `architecture-reviewer` and `plan-verifier`
give an unbiased second opinion (quality vs. requirement-coverage), and `doc-writer` records
what was built. The four new agents mirror the same skill→module routing and honesty rules as
the original three (see below).

## The Plan → Implement loop

`planner` and `implementer` are an **orchestrator-worker** pair:

1. `planner` reads the task + the relevant module `INSIGHTS.md`, then writes a spec to
   `docs/spec/<slug>.md`. Each task is tagged **Type** (backend / ui / core / e2e), the
   **skills** it must apply, its **Owned paths**, `depends-on`, and **Acceptance**. A
   top-level owned-paths matrix proves the parallel tasks are file-disjoint.
2. Several `implementer` agents run **in parallel on the main branch**, each taking one task.
   Parallel-safety comes from every task's non-overlapping **Owned paths** (no worktree
   isolation). Each implementer writes the code + its tests and takes the module suite +
   typecheck to green.
3. Wide review (architecture / security / cross-cutting / the PR gate) is **not** the
   implementer's job — it's left to the existing `pr-self-review` skill.

Both agents inject the **same full set of 12 skills** via `skills:` frontmatter, so plan and
execution share one rulebook. The skill → module routing mirrors
[`.claude/skills/pr-self-review/routing.md`](../skills/pr-self-review/routing.md):

- **backend** (`server/**`) → onion-architecture · fastify-best-practices · drizzle-orm-patterns · postgresql-table-design · zod · security
- **ui** (`client/**`) → frontend-architecture · next-best-practices · react-best-practices · react-testing-library · security
- **core** (`reviewer-core/**`) → onion-architecture (stay pure) · zod · typescript-expert
- **always** → typescript-expert · security · engineering-insights

**Insights are read at both stages (hybrid):** the planner folds cross-cutting insights into
each task at planning time; each implementer additionally reads its own `<module>/INSIGHTS.md`
on the spot before writing code, and appends substantial new discoveries (append-only).

## Design basis & sources (`planner` + `implementer`)

These two agents were designed from published Anthropic / Claude Code guidance. Practices
applied, with sources:

| Practice | How it's used here | Source |
|---|---|---|
| **Orchestrator-worker pattern** | planner decomposes → parallel implementers execute | [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) · [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) |
| **Decompose by shared context, not by role** | implementer owns its code *and* tests together; UI vs backend is a real context split | [When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) |
| **Model tiering (Opus lead / Sonnet worker)** | planner `opus`, implementer `sonnet` | [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) |
| **Inject skills directly via `skills:` frontmatter** | full skill bodies preloaded at startup (deterministic; also sidesteps `next-best-practices` being `user-invocable: false`) | [Sub-agents — preload skills](https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents) |
| **`description` as router / "Use proactively"** | trigger-first descriptions drive auto-delegation | [Sub-agents — automatic delegation](https://code.claude.com/docs/en/sub-agents#understand-automatic-delegation) |
| **Filesystem handoff** | planner writes the spec to a file instead of only chat | [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) |
| **Fresh isolated context → self-contained tasks** | each task is executable standalone; implementer also gets other tasks' owned paths | [Sub-agents — context](https://code.claude.com/docs/en/sub-agents#manage-subagent-context) |
| **Explicit objectives + boundaries** (avoid vague delegation) | per-task Type / Owned paths / Acceptance | [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) |
| **Verification pattern + "early-victory problem"** | narrow self-check with a fixed checklist + explicit exclusions; must run the *complete* suite | [When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) |
| **Tight tool allowlists** | planner read-only (Write only the spec); implementer gets Edit/Write | [Sub-agents — best practices](https://code.claude.com/docs/en/sub-agents#example-subagents) |
| **Structured plan artifact** | fixed spec template (tasks, graph, owned-paths matrix) | [Sub-agents docs](https://code.claude.com/docs/en/sub-agents) |

**Deliberately not adopted:** `isolation: worktree`
([Worktrees docs](https://code.claude.com/docs/en/worktrees)) — the official pattern for
parallel implementers. We chose to run implementers on the main branch and rely on
file-disjoint **Owned paths** for collision-safety instead.

> `researcher` predates these two and is a strictly read-only recon agent (no `Edit`/`Write`,
> Bash restricted to read-only commands). It's the frontmatter/format template the other two
> follow.

## Design basis & sources (`test-writer`, `architecture-reviewer`, `plan-verifier`, `doc-writer`)

The four later agents reuse the same subagent conventions above (single-responsibility,
`description`-as-router, tight tool allowlists, `skills:` preload, honesty rules) plus practices
specific to each agent's job, researched for this task:

**`test-writer`**

| Practice | How it's used here | Source |
|---|---|---|
| **Test-oracle independence** | derive expected behaviour from the spec / acceptance criteria / Zod contract, not by mirroring the implementation (guards against tautological/circular tests) | [Tautological Testing Trap](https://arthurhertweck.dev/writing/tautological-testing) · [Circular Validation in AI-Generated Tests](https://george.tsiokos.com/posts/2025/02/circular-validation-ai-testing/) |
| **Writer/Reviewer split for tests** | test-writer is separate from the implementer that wrote the code | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) |
| **Test behaviour, not implementation** | assert via public interfaces (HTTP responses, RTL user-facing queries, Drizzle results); no internal-state assertions | [Testing Implementation Details — Kent C. Dodds](https://kentcdodds.com/blog/testing-implementation-details) |
| **Testing Trophy / mock at the boundary / what-not-to-test** | integration-at-the-seams over shallow units; mock only external boundaries; skip trivial/framework code | [Write tests. Not too many. Mostly integration.](https://kentcdodds.com/blog/write-tests) · [The Practical Test Pyramid — Fowler](https://martinfowler.com/articles/practical-test-pyramid.html) |
| **TDD ordering + confirm-it-fails; no weakening to get green** | test-first when a spec exists; test-after flagged as higher-risk; never loosen an assertion, address root causes | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) |

**`architecture-reviewer`**

| Practice | How it's used here | Source |
|---|---|---|
| **The Dependency Rule / clean-onion layering** | dependencies point inward; inner layers don't name outer ones; abstraction-altitude check | [The Clean Architecture — R.C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) |
| **Ports & Adapters (hexagonal)** | framework/infra code lives in adapters, not the domain; boundary/port-leakage check | [Hexagonal architecture — Cockburn](https://alistair.cockburn.us/hexagonal-architecture) |
| **Fitness functions / dependency-cruiser** | layering + cycle rules as runnable checks (the repo's depcruise gate) | [Building Evolutionary Architectures — Fowler](https://martinfowler.com/articles/evo-arch-forward.html) · [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) |
| **Read-only reviewer = clean-slate, unbiased** | no `Edit`/`Write`; separate from the implementer's assumptions | [Subagents in Claude Code](https://claude.com/blog/subagents-in-claude-code) |
| **High-signal, evidence-based findings + severity tiers** | `file:line` evidence, CRITICAL/HIGH/MEDIUM/LOW (repo's own scale), avoid nitpicking/false positives | [The false-positive problem in AI code review](https://www.cubic.dev/blog/the-false-positive-problem-why-most-ai-code-reviewers-fail-and-how-cubic-solved-it) |

**`plan-verifier`**

| Practice | How it's used here | Source |
|---|---|---|
| **Verification vs. validation** | judges conformance to the *written* plan, not whether the plan was the right idea | [ISTQB — Verification](https://istqb-glossary.page/verification/) / [Validation](https://istqb-glossary.page/validation/) |
| **Requirements traceability matrix** | one row per requirement/AC → implementation evidence → verifying test → status | [Requirements Traceability Matrix — Perforce](https://www.perforce.com/resources/alm/requirements-traceability-matrix) |
| **Distrust self-reported "done"; re-derive evidence** | re-opens files and re-runs tests rather than trusting a completion claim | [From Confident Closing to Silent Failure (arXiv)](https://arxiv.org/html/2606.09863) |
| **Cite evidence / allow "cannot verify"** | every "Done" carries `file:line`; unlocatable → Missing/Unverifiable | [Anthropic — Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) |
| **AC-level vs. Definition-of-Done** | per-requirement pass ≠ team-wide DoD (tests exist, typecheck green, no regressions) | [Scrum.org — DoD vs Acceptance Criteria](https://www.scrum.org/resources/blog/what-difference-between-definition-done-and-acceptance-criteria) |

**`doc-writer`**

| Practice | How it's used here | Source |
|---|---|---|
| **Diátaxis doc-type classification** | pick tutorial / how-to / reference / explanation and write in one mode | [Diátaxis](https://diataxis.fr/) |
| **C4 model for architecture diagrams** | default Context/Container zoom; Component/Code only for implementers | [C4 model](https://c4model.com/) |
| **Docs-as-code / near the code** | docs live beside what they describe, updated in the same change | [Write the Docs — Docs as Code](https://www.writethedocs.org/guide/docs-as-code/) |
| **Ground every claim in real code; no fabrication** | cite `file:line`, verify against the implementation not the plan's intent; say so if not found | [Anthropic — Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) |
| **Mermaid used selectively & simply** | small, labelled, one-direction; prose where a diagram adds nothing | [`mermaid-diagram` skill](../skills/mermaid-diagram/) |
