# Workflow retro ledger

One row per `/workflow-retro` run (append-only). See `.claude/skills/workflow-retro/SKILL.md`.

| Date | Label | Agents | Tokens total / main | Cache hit | Resumes | Hook tokens | Errors | Biggest waste |
|---|---|---|---|---|---|---|---|---|
| 2026-10-24 | project-context-spec | 4 (1 spec-creator, 3 researcher) | 11.41M / 4.76M | 92% | 3 | 1.73M (13 turns) | 1 | Stop-hook no-op turns — 36% of main tokens |
| 2026-10-25 | project-context-run-plan | 27 (12 implementer, 11 general-purpose, 2 architecture-reviewer, 2 plan-verifier) | 39.43M / 8.33M | 94% | 0 | 3.74M (17 turns) | 5 | Stop-hook no-op turns — 45% of main tokens; G-1 e2e fix 24m on a wrong root-cause hint |
| 2026-10-25 | pr-brief-sdd | 40 (11 implementer, 25 general-purpose, 1 spec-creator, 1 implementation-planner, 1 architecture-reviewer, 1 plan-verifier) | 82.34M / 25.94M | 95% | 2 | 9.02M (37 turns) | 9 | Stop-hook no-op turns — 35% of main tokens; 2nd full pr-self-review (~7.8M) after a 5-file fix set |
