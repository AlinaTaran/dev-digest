import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse, BlastCallerNode } from "@/lib/types";
import { layoutBlastGraph } from "./layout";

const caller = (name: string, over: Partial<BlastCallerNode> = {}): BlastCallerNode => ({
  name,
  file: `src/${name}.ts`,
  line: 10,
  rank: 1,
  endpoints: [],
  crons: [],
  ...over,
});

function makeData(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [],
    downstream: [],
    impacted_endpoints: [],
    summary: "",
    stats: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    degraded: false,
    reason: null,
    max_callers_per_symbol: 20,
    bfs_depth: 2,
    indexed_sha: null,
    ...over,
  };
}

const entry = (symbol: string, callers: BlastCallerNode[], extra: Record<string, string[]> = {}) => ({
  symbol,
  file: "src/decl.ts",
  kind: "function",
  rank: 1,
  callers,
  callers_total: callers.length,
  truncated: false,
  endpoints_affected: [],
  crons_affected: [],
  ...extra,
});

describe("layoutBlastGraph", () => {
  it("assigns symbols, callers, endpoints and crons to left-to-right columns", () => {
    const data = makeData({
      downstream: [
        entry("rateLimit", [caller("router", { endpoints: ["GET /a"], crons: ["job:x"] })], {
          endpoints_affected: ["GET /a"],
          crons_affected: ["job:x"],
        }),
      ],
    });
    const { nodes } = layoutBlastGraph(data);
    const x = (kind: string) => nodes.find((n) => n.kind === kind)!.x;
    expect(nodes.find((n) => n.kind === "symbol")!.label).toBe("rateLimit()");
    expect(x("symbol")).toBeLessThan(x("caller"));
    expect(x("caller")).toBeLessThan(x("endpoint"));
    expect(x("endpoint")).toBe(x("cron"));
    expect(nodes.find((n) => n.kind === "endpoint")!.y).toBeLessThan(nodes.find((n) => n.kind === "cron")!.y);
  });

  it("dedupes a caller shared by two symbols and links both", () => {
    const shared = caller("router");
    const { nodes, edges } = layoutBlastGraph(makeData({ downstream: [entry("a", [shared]), entry("b", [shared])] }));
    expect(nodes.filter((n) => n.kind === "caller")).toHaveLength(1);
    expect(edges.map((e) => e.id).sort()).toEqual(["symbol:src/decl.ts:a->caller:src/router.ts:router", "symbol:src/decl.ts:b->caller:src/router.ts:router"]);
  });

  it("draws caller->endpoint edges from per-caller lists and dashed symbol->endpoint for unreached ones", () => {
    const data = makeData({
      downstream: [
        entry("a", [caller("c1", { endpoints: ["GET /x"] })], { endpoints_affected: ["GET /x", "POST /y"] }),
      ],
    });
    const { edges } = layoutBlastGraph(data);
    const solid = edges.find((e) => e.to === "endpoint:GET /x")!;
    expect(solid).toMatchObject({ from: "caller:src/c1.ts:c1", dashed: false });
    const dashed = edges.find((e) => e.to === "endpoint:POST /y")!;
    expect(dashed).toMatchObject({ from: "symbol:src/decl.ts:a", dashed: true });
    expect(edges.filter((e) => e.to === "endpoint:GET /x")).toHaveLength(1);
  });

  it("falls back to dashed edges for flat impacted_endpoints when nothing is attributed", () => {
    const { edges, nodes } = layoutBlastGraph(
      makeData({ downstream: [entry("a", [])], impacted_endpoints: ["GET /flat"] }),
    );
    expect(nodes.some((n) => n.id === "endpoint:GET /flat")).toBe(true);
    expect(edges).toEqual([expect.objectContaining({ from: "symbol:src/decl.ts:a", to: "endpoint:GET /flat", dashed: true })]);
  });

  it("collapses overflow into a more node past maxPerColumn", () => {
    const callers = Array.from({ length: 6 }, (_, i) => caller(`c${i}`));
    const { nodes } = layoutBlastGraph(makeData({ downstream: [entry("a", callers)] }), { maxPerColumn: 4 });
    expect(nodes.filter((n) => n.kind === "caller")).toHaveLength(3);
    expect(nodes.find((n) => n.kind === "more")).toMatchObject({ count: 3 });
  });

  it("keeps same-named symbols from different files as separate nodes", () => {
    const a = { ...entry("init", [caller("c1")]), file: "src/a.ts" };
    const b = { ...entry("init", [caller("c2")]), file: "src/b.ts" };
    const { nodes, edges } = layoutBlastGraph(makeData({ downstream: [a, b] }));
    const symbols = nodes.filter((n) => n.kind === "symbol");
    expect(symbols).toHaveLength(2);
    expect(symbols.map((n) => n.label)).toEqual(["init()", "init()"]);
    expect(edges.map((e) => e.id).sort()).toEqual([
      "symbol:src/a.ts:init->caller:src/c1.ts:c1",
      "symbol:src/b.ts:init->caller:src/c2.ts:c2",
    ]);
  });

  it("creates no orphan callers for symbols hidden behind the more node", () => {
    const downstream = ["s0", "s1", "s2", "s3"].map((n) => entry(n, [caller(`c-${n}`)]));
    const { nodes, edges } = layoutBlastGraph(makeData({ downstream }), { maxPerColumn: 3 });
    expect(nodes.filter((n) => n.kind === "symbol")).toHaveLength(2);
    const callerIds = nodes.filter((n) => n.kind === "caller").map((n) => n.id);
    expect(callerIds).toHaveLength(2);
    for (const id of callerIds) expect(edges.some((e) => e.to === id)).toBe(true);
  });
});
