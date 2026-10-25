---
name: workflow-retro
description: >-
  Use after a multi-agent run (a Workflow, run-plan, spec-creator → planner → implementers, or
  any session that spawned several subagents) when the user wants a retrospective: tokens
  spent, how many agents ran and in what order, where agents struggled, duplicated work,
  missed information, and how to improve the agent/skill definitions. Invoked manually only.
argument-hint: "[deep] [since:<ISO>] [until:<ISO>] [label:<workflow-name>]"
disable-model-invocation: true
---

# workflow-retro

```
/workflow-retro [deep] [since:2026-10-21T12:50Z] [until:…] [label:project-context-spec]
```

Retrospective of a multi-agent run: **measured numbers + evidence-backed insights + proposed
changes**. You analyse and propose; you never edit agent/skill definitions yourself.

## 1. Collect the numbers

| Mode | When | Source |
|---|---|---|
| **in-context** (default) | the run happened in this conversation | your own context: each subagent's task-notification `<usage>` (`subagent_tokens`, `tool_uses`, `duration_ms`), the Agent/SendMessage calls you made, hand-back reports |
| **deep** (`deep` arg, or in-context data is missing/compacted) | exact tokens, cache, duplication, hook overhead | `python3 .claude/skills/workflow-retro/scripts/collect.py [--session <id>] [--since …] [--until …] --timeline [--json <scratchpad>/metrics.json]` |

- `--session` defaults to the newest transcript of this project (= the current session).
  `--timeline` adds prompts, Agent/SendMessage calls and hand-back reports with timestamps —
  that is the input for section 2. Don't write your own JSONL parser; if the timeline lacks
  something, read that one transcript entry and say so.
- Never estimate a number from memory. In in-context mode, say which numbers are unavailable
  (e.g. main-session tokens) instead of guessing.
- **Scope the window to the workflow itself:** `since` = its first launch, `until` = its last
  event (last hand-back or the orchestrator's final summary). If other work happened between
  the workflow and `/workflow-retro` (or the user's `until` swallows some), tighten the window
  and state both the requested and the used bounds. Agents spawned for the retro are excluded.
- Cost in $ only with `--prices <file>`; otherwise report "not computed".

## 2. Analyse each agent

Work from the hand-back reports, the orchestrator↔agent messages and (deep) the per-agent
tool mix, heaviest results, duplication and error lists. For every agent answer:

- **Hard** — where it stalled, failed tool calls, rework, tool or permission gaps.
- **Easy** — what went fast and cleanly, and why (good prompt, right model, cited sources).
- **Duplicated** — files/facts read or verified by several agents (or by the orchestrator after
  delegating); context re-read; hook-triggered no-op turns.
- **Missed** — requirements, questions or checks it skipped that later caused rework.
- **Delegation quality** — what it had to rediscover that the orchestrator already knew.

**Evidence rule:** every insight cites its anchor — a timestamp, tool call, agent message or
metric. Anything without an anchor is labelled *(inference)*. Do not attribute causes across
events you didn't trace (e.g. "the user caught X") unless the anchor shows it.

## 3. Report (in the user's language, in this order)

1. **Summary** — 3 lines: what ran, total tokens / cache hit, the single biggest *measured*
   waste (name a larger unmeasured one as *(inference)* if you see it).
2. **Metrics** — totals + launch-order table (from the script or the in-context equivalent).
3. **Per-agent insights** — Hard / Easy / Duplicated / Missed, with anchors.
4. **Orchestration** — parallelism (peak vs sequential), resume/rework loops and their trigger
   (requirements churn vs agent error), user corrections and rejected tool calls.
5. **Proposals** — a table, highest impact first:

   | # | Target file | Change | Evidence | Expected effect |
   |---|---|---|---|---|
   | 1 | `.claude/agents/spec-creator.md` | background ⇒ return questions, never draft | 3 resumes, 8 defaults overturned | −2 rework loops |

   Effects are stated in the metrics above (tokens, resumes, errors, minutes). Offer to apply
   proposals only after the user picks them.

## 4. Append the ledger line

Append one row to `docs/retros/ledger.md` (create it with this header if missing). Append-only;
row in English. Errors = failed **or user-rejected** tool calls (the script counts both).

```
| Date | Label | Agents | Tokens total / main | Cache hit | Resumes | Hook tokens | Errors | Biggest waste |
|---|---|---|---|---|---|---|---|---|
```

If an earlier row has the same label, add one sentence to the Summary comparing them (trend);
if none (or the ledger was just created), say "first run, no trend".

## Common mistakes

- Writing an ad-hoc parser instead of running `collect.py` — slower and the numbers drift.
- Counting the retro's own agents/turns in the totals — always set `until`.
- Reporting cache reads as if they were new input — show the breakdown and the cache-hit ratio.
- Generic advice ("improve prompts") — every proposal names a file and a measurable effect.
- Trusting the orchestrator's own summaries — check its claims to the user against the agents'
  hand-backs; a mismatch is a finding.
- Editing `.claude/agents/*.md` or skills directly — proposals only.
