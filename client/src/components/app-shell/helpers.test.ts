import { describe, it, expect } from "vitest";
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
