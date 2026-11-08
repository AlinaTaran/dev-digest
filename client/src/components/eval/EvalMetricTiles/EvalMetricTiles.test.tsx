import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { EvalIntl } from "../test-kit";
import { suiteRun } from "../fixtures";
import { EvalMetricTiles } from "./EvalMetricTiles";

afterEach(cleanup);

const withMetrics = (n: number, recall: number) => {
  const r = suiteRun({ n });
  return { ...r, metrics: { ...r.metrics!, recall } };
};

describe("EvalMetricTiles", () => {
  it("shows integer percentages, an accessible delta and traces passed (AC-47/48)", () => {
    render(
      <EvalIntl>
        <EvalMetricTiles latest={withMetrics(2, 0.86)} previous={withMetrics(1, 0.82)} />
      </EvalIntl>,
    );
    const recall = screen.getByRole("group", { name: "RECALL" });
    expect(within(recall).getByText("86%")).toBeInTheDocument();
    expect(within(recall).getByText("▲ 4pt")).toBeInTheDocument();
    expect(within(recall).getByText("up 4 points")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "PRECISION" })).getByText("91%")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "TRACES PASSED" })).getByText("17/20")).toBeInTheDocument();
  });

  it("omits deltas without a previous run and shows the empty state without runs", () => {
    const { rerender } = render(
      <EvalIntl>
        <EvalMetricTiles latest={withMetrics(1, 0.82)} />
      </EvalIntl>,
    );
    expect(screen.queryByText(/pt$/)).toBeNull();
    rerender(
      <EvalIntl>
        <EvalMetricTiles latest={null} />
      </EvalIntl>,
    );
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
  });
});

describe("EvalMetricTiles sparkline", () => {
  it("draws a sparkline only with two or more points", () => {
    const latest = withMetrics(2, 0.86);
    const { container, rerender } = render(
      <EvalIntl>
        <EvalMetricTiles latest={latest} sparklines={{ recall: [0.8], precision: [0.5, 0.9] }} />
      </EvalIntl>,
    );
    expect(container.querySelectorAll("svg path")).toHaveLength(1);
    expect(container.innerHTML).not.toContain("NaN");
    rerender(
      <EvalIntl>
        <EvalMetricTiles latest={latest} />
      </EvalIntl>,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });
});
