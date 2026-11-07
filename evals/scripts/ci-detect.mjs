/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   any CLAUDE.md / AGENTS.md, .claude/settings.json, any agent definition, the workflow cases,
 *   the eval engine, or a skill the workflow cases name   → run the workflow tier
 *
 * EVAL_SCOPE=all ignores the diff and selects every skill/agent that has evals + the workflow tier
 * (manual `workflow_dispatch` runs).
 *
 * A changed artifact with NO written evals is NOT a failure: it is logged as
 * `SKIP <tier> <name> (no evals)` and reported on the `skipped_*` outputs.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, readFileSync, appendFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_ALL = process.env.EVAL_SCOPE === "all";

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** *.eval.ts files directly inside evals/<sub>/ (empty if the dir is missing). */
function evalFiles(sub) {
  const dir = join(EVALS_DIR, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".eval.ts"));
}

const hasEvals = (tier, name) => evalFiles(join(tier, name)).length > 0;

/** Every <name> under evals/<tier>/ that has at least one *.eval.ts. */
function allWithEvals(tier) {
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => statSync(join(dir, n)).isDirectory() && hasEvals(tier, n))
    .sort();
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** Skill names the workflow cases reference (`skill: "<name>"`) — their activation is asserted there. */
function workflowSkills() {
  const dir = join(EVALS_DIR, "workflow");
  if (!existsSync(dir)) return new Set();
  const names = new Set();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".cases.ts"))) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/skill:\s*["']([^"']+)["']/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

const skillNames = SCOPE_ALL
  ? allWithEvals("skills")
  : touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
const agentNames = SCOPE_ALL
  ? allWithEvals("agents")
  : touched(/^\.claude\/agents\/([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//);

const skills = skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
const agents = agentNames.filter((n) => hasEvals("agents", n));
const skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it.
const wfSkills = workflowSkills();
const workflowTriggers = SCOPE_ALL
  ? ["(scope=all)"]
  : changed.filter(
      (f) =>
        /(^|\/)(CLAUDE|AGENTS)\.md$/.test(f) || // root + nested CLAUDE.md / AGENTS.md (routing docs)
        f === ".claude/settings.json" ||
        /^\.claude\/agents\/.+\.md$/.test(f) ||
        /^evals\/workflow\//.test(f) ||
        /^evals\/src\//.test(f) ||
        [...wfSkills].some((s) => f.startsWith(`.claude/skills/${s}/`)),
    );
const workflowWanted = workflowTriggers.length > 0;
const workflowHasEvals = evalFiles("workflow").length > 0;
const runWorkflow = workflowWanted && workflowHasEvals;

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
const log = (s) => console.error(s);
log("── eval change detection ──");
log(`scope         : ${SCOPE_ALL ? "all" : "changed files"}`);
log(`changed files : ${changed.length}`);
log(`skills → run  : ${skills.join(", ") || "(none)"}`);
log(`agents → run  : ${agents.join(", ") || "(none)"}`);
log(`workflow tier : ${runWorkflow ? `run (triggered by: ${workflowTriggers.join(", ")})` : "skip"}`);
for (const n of skippedSkills) log(`SKIP skill ${n} (no evals in evals/skills/${n}/)`);
for (const n of skippedAgents) log(`SKIP agent ${n} (no evals in evals/agents/${n}/)`);
if (workflowWanted && !workflowHasEvals) log("SKIP workflow tier (no evals in evals/workflow/)");
