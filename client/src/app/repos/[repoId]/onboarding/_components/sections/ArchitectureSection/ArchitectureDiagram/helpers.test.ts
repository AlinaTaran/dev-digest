import { describe, it, expect } from "vitest";
import type { OnboardingDiagramNode } from "@devdigest/shared";
import {
  LABEL_LINE_CHARS,
  MIN_SCALE,
  NODE_H,
  NODE_W,
  edgePath,
  fitScale,
  labelBox,
  layoutLabels,
  layoutNodes,
  wrapLabel,
} from "./helpers";

const node = (id: string, kind: OnboardingDiagramNode["kind"]): OnboardingDiagramNode =>
  ({ id, kind, label: id, path: null }) as OnboardingDiagramNode;

describe("wrapLabel", () => {
  it("keeps a short label on one line", () => {
    expect(wrapLabel("run review")).toEqual(["run review"]);
  });

  it("wraps on spaces into at most two lines, cutting the rest with an ellipsis", () => {
    const lines = wrapLabel("REST /repos /pulls /agents /reviews");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("REST /repos");
    expect(lines.every((l) => Array.from(l).length <= LABEL_LINE_CHARS)).toBe(true);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  it("hard-cuts a single word longer than a line", () => {
    const [first, second] = wrapLabel("a".repeat(LABEL_LINE_CHARS * 3));
    expect(Array.from(first!).length).toBe(LABEL_LINE_CHARS);
    expect(second!.endsWith("…")).toBe(true);
  });
});

describe("edgePath", () => {
  it("routes an edge that skips a column through a free lane, not under the middle node", () => {
    const layout = layoutNodes([node("engine", "module"), node("db", "datastore"), node("llm", "external")]);
    const [engine, db, llm] = layout.placed;
    const p = edgePath(engine!, llm!, layout);
    const ys = [...p.d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0])).filter((_, i) => i % 2 === 1);
    const dbTop = db!.y;
    const dbBottom = db!.y + NODE_H;
    // Every horizontal run across the middle column must sit outside the db node's box.
    const lane = p.lane!;
    expect(lane < dbTop || lane > dbBottom).toBe(true);
    expect(ys).toContain(lane);
  });

  it("anchors the label in the gap just before the target, beside the arrowhead", () => {
    const layout = layoutNodes([node("api", "entrypoint"), node("db", "datastore")]);
    const [api, db] = layout.placed;
    const p = edgePath(api!, db!, layout);
    expect(p.lx).toBeGreaterThan(api!.x + NODE_W);
    expect(p.lx).toBeLessThan(db!.x);
  });
});

describe("layoutLabels", () => {
  it("moves labels apart vertically when they would overlap", () => {
    const out = layoutLabels([
      { lines: ["Drizzle ORM"], x: 100, y: 50 },
      { lines: ["index repo"], x: 104, y: 52 },
    ]);
    expect(Math.abs(out[0]!.y - out[1]!.y)).toBeGreaterThanOrEqual(labelBox(["x"]).h);
  });

  it("leaves labels in different gaps alone", () => {
    const out = layoutLabels([
      { lines: ["a"], x: 100, y: 50 },
      { lines: ["b"], x: 400, y: 50 },
    ]);
    expect(out.map((l) => l.y)).toEqual([50, 50]);
  });
});

describe("lane sharing", () => {
  it("offsets a second edge routed through the same lane", () => {
    const layout = layoutNodes([node("api", "entrypoint"), node("engine", "module"), node("db", "datastore"), node("llm", "external")]);
    const [api, engine, db, llm] = layout.placed;
    const laneUse = new Map<number, number>();
    const first = edgePath(api!, db!, layout, laneUse);
    const second = edgePath(engine!, llm!, layout, laneUse);
    expect(first.lane).toBeDefined();
    expect(second.lane).not.toBe(first.lane);
  });
});

describe("fitScale", () => {
  it("never upscales, shrinks to fit, and stops at the readability floor", () => {
    expect(fitScale(1500, 1200)).toBe(1);
    expect(fitScale(1080, 1200)).toBeCloseTo(0.9);
    expect(fitScale(500, 1200)).toBe(MIN_SCALE);
    expect(fitScale(0, 1200)).toBe(1); // not measured yet
  });
});
