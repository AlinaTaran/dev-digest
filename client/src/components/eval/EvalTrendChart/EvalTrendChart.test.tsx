import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { EvalTrendPoint } from "@devdigest/shared";
import { EvalIntl } from "../test-kit";
import { EvalTrendChart, TrendTooltipBody } from "./EvalTrendChart";

afterEach(cleanup);

const point = (v: number, over: Partial<EvalTrendPoint> = {}): EvalTrendPoint => ({
  run_id: `r${v}`,
  agent_version: v,
  ran_at: `2026-05-0${v}T09:14:00Z`,
  recall: 0.8,
  precision: 0.9,
  citation_accuracy: 0.95,
  pass_rate: 1,
  cost_usd: 0.23,
  ...over,
});

describe("EvalTrendChart", () => {
  it("exposes one table row per run in the given order (AC-56)", () => {
    render(
      <EvalIntl>
        <EvalTrendChart points={[point(5), point(6, { recall: 0.5 }), point(7)]} />
      </EvalIntl>,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["v5", "v6", "v7"]);
    expect(within(rows[1]!).getByText("50%")).toBeInTheDocument();
  });

  it("tooltip shows version, three percentages and cost (AC-57)", () => {
    render(
      <EvalIntl>
        <TrendTooltipBody point={point(7)} />
      </EvalIntl>,
    );
    expect(screen.getByText(/v7/)).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("$0.23")).toBeInTheDocument();
  });

  it("shows the hint for exactly one run and no chart (AC-58)", () => {
    render(
      <EvalIntl>
        <EvalTrendChart points={[point(1)]} />
      </EvalIntl>,
    );
    expect(screen.getByText("Run evals at least twice to see a trend")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
