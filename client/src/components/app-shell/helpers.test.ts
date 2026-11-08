import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

const ID = "3f2b8c1e-6a4d-4e0b-9d57-1a2b3c4d5e6f";

describe("activeKeyFor", () => {
  it("maps the repo-scoped tour route to onboarding-tour, nothing else", () => {
    expect(activeKeyFor(`/repos/${ID}/onboarding`)).toBe("onboarding-tour");
    expect(activeKeyFor(`/repos/${ID}/onboarding#critical-paths`)).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/new")).toBe("");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor(`/repos/${ID}/pulls`)).toBe("pulls");
    expect(activeKeyFor(`/repos/${ID}/context`)).toBe("context");
  });
});

describe("eval nav (AC-59)", () => {
  it("highlights the Eval Dashboard item on /eval and below", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/agent-1")).toBe("eval");
  });
  it("registers the nav item after Conventions in SKILLS LAB, linking to /eval", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    const keys = lab.items.map((i) => i.key);
    expect(keys.indexOf("eval")).toBe(keys.indexOf("conventions") + 1);
    expect(lab.items.find((i) => i.key === "eval")?.href).toBe("/eval");
  });
});
