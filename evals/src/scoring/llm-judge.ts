/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

/** A judge result as returned by the model — untrusted shape. */
type RawResult = { practice?: unknown; passed?: unknown; evidence?: unknown };

function parseVerdict(text: string): RawResult[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

const norm = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Map the judge's raw results onto OUR practice list, so the score can't be gamed by the judge's
 * output shape: the denominator is always practices.length, a practice the judge skipped is FAIL,
 * extra/invented results are ignored, and only a literal boolean `true` counts as PASS.
 *
 * Matching: exact (normalized) practice text first, each result used at most once. If the judge
 * returned exactly one result per practice but reworded them, unmatched practices fall back to the
 * result at the same position (the rubric numbers the practices, so order is the judge's contract).
 */
export function alignVerdict(practices: string[], raw: RawResult[]): Verdict {
  const used = new Set<number>();
  const byText = practices.map((p) => {
    const i = raw.findIndex((r, j) => !used.has(j) && norm(r.practice) === norm(p));
    if (i !== -1) used.add(i);
    return i;
  });
  const positional = raw.length === practices.length;

  const results = practices.map((practice, k) => {
    let i = byText[k];
    if (i === -1 && positional && !used.has(k)) {
      i = k;
      used.add(k);
    }
    if (i === -1) return { practice, passed: false, evidence: "(judge returned no verdict for this practice)" };
    const r = raw[i];
    return { practice, passed: r.passed === true, evidence: String(r.evidence ?? "") };
  });

  const total = practices.length;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: total ? passed / total : 0 };
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 1, model });
  return alignVerdict(practices, parseVerdict(res.text));
}
