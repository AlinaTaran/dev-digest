import { describe, it, expect } from "vitest";
import { formatCost } from "./format";

describe("formatCost", () => {
  it("returns — for null", () => {
    expect(formatCost(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatCost(undefined)).toBe("—");
  });

  it("returns $0.00 for exact zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  describe("≥$1", () => {
    it("shows 2 decimal places", () => {
      expect(formatCost(1.5)).toBe("$1.50");
      expect(formatCost(12.345)).toBe("$12.35");
    });
  });

  describe("$0.01–$0.99", () => {
    it("strips trailing zeros", () => {
      expect(formatCost(0.012)).toBe("$0.012");
      expect(formatCost(0.010)).toBe("$0.01");
      expect(formatCost(0.015)).toBe("$0.015");
    });

    it("rounds to 3 decimal places", () => {
      expect(formatCost(0.0146)).toBe("$0.015");
    });
  });

  describe("sub-cent (<$0.01) — 3 significant figures", () => {
    it("shows 3 sig figs for 0.001 range", () => {
      // 0.00106 → magnitude=-3, dp=5
      expect(formatCost(0.001059)).toBe("$0.00106");
      expect(formatCost(0.001500)).toBe("$0.00150");
    });

    it("shows 3 sig figs for 0.0001 range — real OpenRouter values", () => {
      expect(formatCost(0.000717)).toBe("$0.000717");
      expect(formatCost(0.000915)).toBe("$0.000915");
      expect(formatCost(0.000815)).toBe("$0.000815");
    });

    it("keeps trailing zeros (they are significant)", () => {
      expect(formatCost(0.000600)).toBe("$0.000600");
      expect(formatCost(0.001000)).toBe("$0.00100");
    });

    it("does not collapse to fewer than 3 sig figs", () => {
      // $0.0006 would be 1 sig fig — must not happen
      expect(formatCost(0.000640)).not.toBe("$0.0006");
      expect(formatCost(0.000640)).toBe("$0.000640");
    });
  });
});
