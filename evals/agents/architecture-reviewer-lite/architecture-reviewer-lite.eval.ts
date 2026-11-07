import { describeAgent, runAgentCases } from "../../src/index.js";
// Same cases, fixtures and prompts as the strict agent — only the agent under test differs, so the
// two versions run under identical conditions (compare via `eval:repeat`, see evals/README.md).
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", cases));
