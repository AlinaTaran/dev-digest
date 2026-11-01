import { describe, it, expect } from "vitest";
import { TABS, VALID_TABS } from "./constants";

describe("AgentEditor tabs", () => {
  it("accepts every rendered tab (incl. context) as a valid ?tab= value", () => {
    expect(VALID_TABS).toEqual(TABS.map((t) => t.key));
    expect(VALID_TABS).toContain("context");
  });
});
