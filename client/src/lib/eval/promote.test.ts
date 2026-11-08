import { describe, it, expect } from "vitest";
import { suiteRun } from "@/components/eval/fixtures";
import { promotePatch, skillPromotePatch } from "./promote";

describe("promotePatch", () => {
  it("returns null when equal and the snapshot fields otherwise", () => {
    const run = suiteRun({ n: 2 });
    const s = run.config_snapshot;
    const cur = { provider: s.provider, model: s.model, system_prompt: s.system_prompt, strategy: s.strategy } as never;
    expect(promotePatch(run, cur)).toBeNull();
    expect(promotePatch(run, { ...(cur as object), model: "other" } as never)).toEqual({
      provider: s.provider,
      model: s.model,
      system_prompt: s.system_prompt,
      strategy: s.strategy,
    });
  });
});

describe("skillPromotePatch", () => {
  it("returns the body unless equal to the current one or absent", () => {
    const run = suiteRun({ n: 2, config_snapshot: { ...suiteRun().config_snapshot, skill_body: "new" } });
    expect(skillPromotePatch(run, { body: "new" })).toBeNull();
    expect(skillPromotePatch(run, { body: "old" })).toEqual({ body: "new" });
    expect(skillPromotePatch(suiteRun({ n: 2 }), { body: "old" })).toBeNull();
  });
});
