import { describe, it, expect } from "vitest";
import { confidenceColor, evidenceLineSuffix } from "./helpers";

describe("confidenceColor", () => {
  it("returns the ok color at and above the 0.85 threshold", () => {
    expect(confidenceColor(0.85)).toBe("var(--ok)");
    expect(confidenceColor(0.95)).toBe("var(--ok)");
    expect(confidenceColor(1)).toBe("var(--ok)");
  });

  it("returns the warn color between 0.65 and just below 0.85", () => {
    expect(confidenceColor(0.65)).toBe("var(--warn)");
    expect(confidenceColor(0.84)).toBe("var(--warn)");
    expect(confidenceColor(0.7)).toBe("var(--warn)");
  });

  it("returns the muted color below 0.65", () => {
    expect(confidenceColor(0.64)).toBe("var(--text-muted)");
    expect(confidenceColor(0)).toBe("var(--text-muted)");
  });
});

describe("evidenceLineSuffix", () => {
  it("renders a single line as :N when start === end", () => {
    expect(evidenceLineSuffix({ evidence_line_start: 11, evidence_line_end: 11 })).toBe(":11");
  });

  it("renders a single line as :N when there's no end line", () => {
    expect(evidenceLineSuffix({ evidence_line_start: 11, evidence_line_end: null })).toBe(":11");
  });

  it("renders a range as :N-M when start !== end", () => {
    expect(evidenceLineSuffix({ evidence_line_start: 11, evidence_line_end: 15 })).toBe(":11-15");
  });

  it("renders nothing when there's no line info at all", () => {
    expect(evidenceLineSuffix({ evidence_line_start: null, evidence_line_end: null })).toBe("");
  });
});
