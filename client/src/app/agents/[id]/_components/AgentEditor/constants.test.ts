import { describe, it, expect } from "vitest";
import { TABS, VALID_TABS } from "./constants";

describe("AgentEditor tabs", () => {
  it("accepts every rendered tab (incl. context) as a valid ?tab= value", () => {
    expect(VALID_TABS).toEqual(TABS.map((t) => t.key));
    expect(VALID_TABS).toContain("context");
  });

  it("places the CI tab right after Evals (AC-1)", () => {
    const keys = TABS.map((t) => t.key);
    expect(keys.indexOf("ci")).toBe(keys.indexOf("evals") + 1);
    expect(VALID_TABS).toContain("ci");
  });
});
