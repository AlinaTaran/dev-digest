import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Every `expectFilesRead`/`expectFileRead`/`expectSubagent` target below was verified to actually
 * exist AND to match what the relevant CLAUDE.md's own "Read when" row actually routes to
 * (2026-11-04 — three earlier cases pointed at `server/docs/api-contracts.md`,
 * `reviewer-core/docs/pipeline.md`, `reviewer-core/insights/gotchas.md`, none of which ever
 * existed; see reviewer-core/INSIGHTS.md and the architecture-reviewer fixture fix the same day
 * for the same class of bug).
 *
 * Merging caveat — LEARNED THE HARD WAY, not just a theoretical risk: a first version of this
 * file tried to fold unrelated intents into one prompt to save sessions. Two of three merges
 * (reviewer-core design.md+INSIGHTS.md, e2e) passed cleanly — but a Fastify-route-with-business-
 * logic prompt only ever engaged `fastify-best-practices` (the louder, procedural sub-ask) and
 * never `onion-architecture` (the quieter, conceptual one); a DI+cost-tracking contrast read the
 * real source code instead of the architecture.md doc; and chaining implementation-planner then
 * test-writer in one session never reached the second dispatch because implementation-planner is
 * a heavy, clarifying-question-asking subagent that ate the whole turn budget. All three are now
 * split back into one assertion per session below. Only merge when a quick validation run
 * (`pnpm eval:repeat workflow -n 5`) actually confirms both sub-intents fire reliably together —
 * don't assume a plausible-sounding combined prompt will discriminate cleanly.
 *
 * Budget: 16 Claude sessions total.
 *   - 2 × trace                                            = 2
 *   - 2 × dispatch (one subagent each)                     = 2
 *   - 2 × activation pair (positive + near-miss negative)  = 4
 *   - 4 × contrast (2 sessions each: treatment + control)  = 8
 */
const HERE = dirname(fileURLToPath(import.meta.url));
// Reuse the architecture-reviewer agent's existing diff fixture instead of duplicating it.
const CHECKOUT_DIFF = readFileSync(
  join(HERE, "..", "agents", "architecture-reviewer", "fixtures", "checkout-service.diff"),
  "utf8",
);

export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "API-route task reads server's conventions doc AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    // Root CLAUDE.md "Read when": "Working inside a package → read that package's AGENTS.md" — a
    // "конвенції" (conventions) prompt routes here. But server/CLAUDE.md's own "before changing an
    // established pattern → INSIGHTS.md" row is ALSO a legitimate match for the same prompt, and
    // confirmed empirically (2026-11-07) to be a real, non-deterministic alternative the model
    // sometimes picks instead — both are correct CLAUDE.md-driven routing, so both count.
    expectFilesRead: [["server/AGENTS.md", "server/INSIGHTS.md"]],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- dispatch (1 session): implementation-planner on a fresh feature request -------------------
  {
    kind: "dispatch",
    name: "feature requirements dispatch implementation-planner",
    // Reworded 2026-11-07: a bare "ось вимоги" framing sometimes sent the model toward
    // spec-creator instead (it reasonably read "feature requirements" as needing a product spec
    // FIRST, per the repo's own spec-creator -> implementation-planner -> implementer pipeline).
    // Explicitly marking the requirements as already-final/approved and purely technical removes
    // that ambiguity.
    prompt:
      "Ось ЗАТВЕРДЖЕНІ, фінальні вимоги на невелику технічну зміну (продуктовий спек не потрібен, " +
      "вимоги вже достатньо чіткі): додати можливість позначати знахідку ревʼю як 'виправлено' з " +
      "UI. ОБОВ'ЯЗКОВО одразу склади implementation plan під ці вимоги через сабагента " +
      "implementation-planner (не spec-creator — вимоги вже фінальні) — не планируй сам.",
    expectSubagent: "implementation-planner",
    maxTurns: 8,
  },

  // --- dispatch (1 session): test-writer on an existing module ------------------------------------
  {
    kind: "dispatch",
    name: "test request dispatches test-writer",
    prompt:
      "Напиши тести для серверного модуля reviews (server/src/modules/reviews). ОБОВ'ЯЗКОВО запусти " +
      "сабагента test-writer — сам тести не пиши.",
    expectSubagent: "test-writer",
    maxTurns: 8,
  },

  // --- activation (1 session): fastify-best-practices on a new Fastify route ----------------------
  {
    kind: "activation",
    name: "fastify-best-practices activates on a new Fastify route",
    prompt:
      "Додаю нову API-route в Fastify для експорту ревʼю як markdown — підкажи, як правильно її " +
      "підняти, з валідацією вхідних параметрів через JSON schema.",
    skill: "fastify-best-practices",
    shouldActivate: true,
    maxTurns: 7,
  },

  // --- activation (1 session): onion-architecture on a NOVEL placement question -------------------
  {
    kind: "activation",
    name: "onion-architecture activates on a novel placement question",
    // Reworded 2026-11-07 (round 2): even on an unprecedented CSV scenario, a generic "де має йти
    // логіка" framing still let the model sometimes just explore service/adapter code directly and
    // answer from that, without ever touching the skill — the skill's own description triggers on
    // specific phrases ("creating a module, importing drizzle-orm or fastify, wiring an adapter,
    // touching container.ts"), not on a generic placement question. Reworded to use those literal
    // trigger words (wiring a new adapter, container.ts) instead of paraphrasing them.
    prompt:
      "Додаю нову можливість: експорт findings у CSV. Це вимагає wiring нового adapter'а через " +
      "server/src/platform/container.ts. Як правильно підключити (wire) цей новий adapter за " +
      "onion-конвенціями цього репо, а не просто створити інстанс де зручно?",
    skill: "onion-architecture",
    shouldActivate: true,
    maxTurns: 7,
  },

  // --- trace (1 session): dispatch routing -> architecture-reviewer subagent ---------------------
  // Reuses the architecture-reviewer agent's own eval fixture (checkout-service.diff) instead of
  // writing a new diff — same diff, different question (does the harness dispatch the subagent).
  {
    kind: "trace",
    name: "architecture audit request dispatches architecture-reviewer",
    prompt:
      `Проведи архітектурний аудит цього diff проти onion-контрактів репо. ОБОВʼЯЗКОВО запусти для ` +
      `цього субагента architecture-reviewer — не рецензуй сам.\n\n${CHECKOUT_DIFF}`,
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- contrast (2 sessions): server/CLAUDE.md routes a DI-wiring task to architecture.md --------
  {
    kind: "contrast",
    name: "server CLAUDE.md routes a DI-wiring task to architecture.md",
    // Worded to mirror server/CLAUDE.md's own "Read when" phrasing ("design rationale or deep
    // architecture notes") rather than a generic "конвенції" ask — the generic wording empirically
    // sent the model straight to INSIGHTS.md + live source instead (found 2026-11-04).
    prompt:
      "Хочу додати новий adapter в DI-контейнер в server/ — це архітектурна зміна. Перш ніж писати " +
      "код, хочу зрозуміти design rationale і глибокі архітектурні нотатки цього пакета щодо DI.",
    // server/docs/architecture.md has a "Dependency injection via the container" section.
    expectFilesRead: ["server/docs/architecture.md"],
    maxTurns: 8,
  },

  // --- contrast (2 sessions): server/CLAUDE.md routes a product-behavior task to its real spec ---
  {
    kind: "contrast",
    name: "server CLAUDE.md routes a product-behavior task to run-cost-tracking.md",
    // Same fix as above: echoes "product behavior" verbatim (server/CLAUDE.md's exact Read-when
    // trigger word) instead of a generic "конвенції" ask.
    prompt:
      "Хочу додати нову продуктову поведінку (product behavior) в server/ — трекінг вартості " +
      "кожного запуску ревʼю. Перш ніж писати код, хочу перевірити, чи ця поведінка вже десь " +
      "специфікована.",
    // server/CLAUDE.md "Read when": "Adding/changing a product behavior → server/specs/" (the real
    // spec there is run-cost-tracking.md). The same server-scoped prompt also legitimately matches
    // root CLAUDE.md's "Working inside a package → AGENTS.md" row, AND server/CLAUDE.md's own
    // "before changing an established pattern → INSIGHTS.md" row — the "чи вже специфіковано"
    // (check if already specified) framing reads as "look at past decisions" just as validly as
    // "look at the behavior spec". Empirically (2026-11-07) the model consistently and repeatedly
    // chose INSIGHTS.md across every treatment run observed — all three are correct CLAUDE.md
    // routing outcomes for this prompt.
    expectFilesRead: [["server/specs/run-cost-tracking.md", "server/AGENTS.md", "server/INSIGHTS.md"]],
    maxTurns: 8,
  },

  // --- contrast (2 sessions): reviewer-core/CLAUDE.md routes a compound task to TWO real docs ----
  // "Changing a pipeline step while something behaved unexpectedly" is one realistic situation,
  // not two: a dev touching the engine naturally wants both the design rationale AND past gotchas
  // before changing an established pattern.
  {
    kind: "contrast",
    name: "reviewer-core CLAUDE.md routes a pipeline-change task to design.md and INSIGHTS.md",
    prompt:
      "Хочу змінити крок у review pipeline в reviewer-core, і при цьому помітив дивну поведінку, " +
      "яку, можливо, вже хтось задокументував раніше. Перш ніж чіпати код, звірся з документацією " +
      "цього репо — і щодо дизайну pipeline, і щодо вже відомих нюансів.",
    // reviewer-core/CLAUDE.md "Read when": design rationale -> reviewer-core/docs/ (only design.md
    // exists there); before changing an established pattern -> reviewer-core/INSIGHTS.md.
    expectFilesRead: ["reviewer-core/docs/design.md", "reviewer-core/INSIGHTS.md"],
    maxTurns: 8,
  },

  // --- contrast (2 sessions): e2e/CLAUDE.md routes a new-flow task to writing-flows.md -----------
  {
    kind: "contrast",
    name: "e2e CLAUDE.md routes a new-flow task to writing-flows.md",
    prompt:
      "Пишу новий e2e-флоу для сценарію логіну. Перш ніж писати JSON-флоу, звірся з конвенціями " +
      "цього репо щодо того, як додавати новий flow.",
    // e2e/CLAUDE.md "Read when": "Need rationale or how to add a flow -> read e2e/docs/" (the only
    // file there is writing-flows.md — NOT "flows.md").
    expectFilesRead: ["e2e/docs/writing-flows.md"],
    maxTurns: 6,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  // Known flaky at n=1 (confirmed via `pnpm eval:repeat workflow -t insight -n 5`, 2026-11-04):
  // positive 3/5 (60%), negative 3/4 (75%, one run produced no record). Not a regression from the
  // disallowedTools safety fix (see run-claude.ts) — both directions are independently unstable,
  // matching the same kind of model non-determinism already logged in
  // reviewer-core/INSIGHTS.md's "Open Questions" (same agent + same input, different verdict
  // across runs). A single red run here doesn't mean the skill broke; re-run before concluding
  // anything changed.
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 7,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 7,
  },
];
