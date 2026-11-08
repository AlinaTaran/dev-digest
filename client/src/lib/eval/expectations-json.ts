/* eval/expectations-json.ts — client-side validation of the expected-output JSON editor.
   Hand-written mirror of the `EvalExpectation` schema (contracts/eval.ts): the shared barrel
   must stay type-only on the client (its `.js` specifiers don't resolve under Next). */
import type { EvalExpectation } from "@devdigest/shared";

export const MAX_EXPECTATIONS = 50;
const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"];
const CATEGORIES = ["bug", "security", "perf", "style", "test"];
const KEYS = new Set(["expect", "file", "start_line", "end_line", "severity", "category", "title"]);

export type ParseExpectationsResult =
  | { ok: true; value: EvalExpectation[] }
  | { ok: false; path: string; message: string };

/** A valid starter object for the "+ Finding skeleton" button (AC-19). */
export const FINDING_SKELETON: EvalExpectation = {
  expect: "must_find",
  file: "src/example.ts",
  start_line: 1,
  severity: "WARNING",
  category: "bug",
  title: "Describe the expected finding",
};

const fail = (path: string, message: string): ParseExpectationsResult => ({ ok: false, path, message });
const isInt1 = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

export function parseExpectationsJson(text: string): ParseExpectationsResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return fail("", e instanceof Error ? e.message : "Invalid JSON");
  }
  if (!Array.isArray(data)) return fail("", "Expected a JSON array");
  if (data.length > MAX_EXPECTATIONS) return fail("", `At most ${MAX_EXPECTATIONS} expectations`);

  for (let i = 0; i < data.length; i++) {
    const item: unknown = data[i];
    const at = (k: string) => `[${i}].${k}`;
    if (item === null || typeof item !== "object" || Array.isArray(item)) return fail(`[${i}]`, "Expected an object");
    const o = item as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!KEYS.has(k)) return fail(at(k), "Unknown key");
    if (o.expect !== "must_find" && o.expect !== "must_not_flag") {
      return fail(at("expect"), 'Must be "must_find" or "must_not_flag"');
    }
    if (typeof o.file !== "string" || o.file.length < 1 || o.file.length > 500) {
      return fail(at("file"), "Must be a non-empty string (max 500)");
    }
    if (!isInt1(o.start_line)) return fail(at("start_line"), "Must be an integer ≥ 1");
    if (o.end_line !== undefined && !isInt1(o.end_line)) return fail(at("end_line"), "Must be an integer ≥ 1");
    if (o.severity !== undefined && !SEVERITIES.includes(o.severity as string)) {
      return fail(at("severity"), `Must be one of ${SEVERITIES.join(", ")}`);
    }
    if (o.category !== undefined && !CATEGORIES.includes(o.category as string)) {
      return fail(at("category"), `Must be one of ${CATEGORIES.join(", ")}`);
    }
    if (o.title !== undefined && (typeof o.title !== "string" || o.title.length > 200)) {
      return fail(at("title"), "Must be a string (max 200)");
    }
  }
  return { ok: true, value: data as EvalExpectation[] };
}
