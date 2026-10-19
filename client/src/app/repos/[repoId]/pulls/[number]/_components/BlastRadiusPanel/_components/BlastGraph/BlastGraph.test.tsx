import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import blast from "../../../../../../../../../../messages/en/blast.json";
import type { BlastRadiusResponse } from "@/lib/types";
import { BlastGraph } from "./BlastGraph";

afterEach(cleanup);

function renderGraph(data: BlastRadiusResponse) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <BlastGraph data={data} />
    </NextIntlClientProvider>,
  );
}

const base: BlastRadiusResponse = {
  changed_symbols: [{ name: "rateLimit", file: "src/rl.ts", kind: "function" }],
  downstream: [],
  impacted_endpoints: [],
  summary: "",
  stats: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
  degraded: false,
  reason: null,
  max_callers_per_symbol: 20,
  bfs_depth: 2,
  indexed_sha: null,
};

describe("BlastGraph", () => {
  it("renders an accessible graph with node titles and legend", () => {
    renderGraph({
      ...base,
      downstream: [
        {
          symbol: "rateLimit",
          file: "src/rl.ts",
          kind: "function",
          rank: 1,
          callers_total: 1,
          truncated: false,
          callers: [{ name: "publicRouter", file: "src/router.ts", line: 7, rank: 1, endpoints: ["GET /api/public"], crons: ["job:sweep"] }],
          endpoints_affected: ["GET /api/public"],
          crons_affected: ["job:sweep"],
        },
      ],
    });
    expect(screen.getByRole("img", { name: "Blast radius graph: 1 changed symbols, 1 callers, 1 endpoints, 1 cron/jobs" })).toBeInTheDocument();
    expect(screen.getByText("Changed symbol rateLimit")).toBeInTheDocument();
    expect(screen.getByText("Caller publicRouter at src/router.ts:7")).toBeInTheDocument();
    expect(screen.getByText("Endpoint GET /api/public")).toBeInTheDocument();
    expect(screen.getByText("Cron job:sweep")).toBeInTheDocument();
    for (const text of ["changed symbol", "callers", "endpoints affected", "cron/jobs"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("renders the empty message when there is nothing to graph", () => {
    renderGraph(base);
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
