import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EvalIntl } from "../test-kit";
import { suiteRun } from "../fixtures";
import { EvalRunHistory } from "./EvalRunHistory";

afterEach(cleanup);

const runs = [
  suiteRun({ n: 1 }),
  suiteRun({ n: 3 }),
  suiteRun({ n: 2, status: "partial", cases_errored: 2, error_reason: "interrupted" }),
];

describe("EvalRunHistory", () => {
  it("lists newest first, limits selection to two and compares older to newer (AC-49/50/51, NFR-5)", () => {
    const onCompare = vi.fn();
    render(
      <EvalIntl>
        <EvalRunHistory runs={runs} onCompare={onCompare} />
      </EvalIntl>,
    );
    const versions = screen.getAllByText(/^v\d$/).map((n) => n.textContent);
    expect(versions).toEqual(["v3", "v2", "v1"]);
    expect(screen.getByText("2026-05-13 09:14")).toBeInTheDocument();

    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    const box = (v: string, d: string) => screen.getByRole("checkbox", { name: `Select run ${v}, ${d}` });
    fireEvent.click(box("v3", "2026-05-13 09:14"));
    expect(compare).toBeDisabled();
    fireEvent.click(box("v1", "2026-05-11 09:14"));
    expect(compare).toBeEnabled();
    expect(box("v2", "2026-05-12 09:14")).toBeDisabled();
    fireEvent.click(compare);
    expect(onCompare).toHaveBeenCalledWith(runs[1], runs[0]);

    fireEvent.click(box("v1", "2026-05-11 09:14"));
    expect(compare).toBeDisabled();
    expect(box("v2", "2026-05-12 09:14")).toBeEnabled();
  });

  it("badges partial runs with the errored count and expands details (AC-42)", () => {
    render(
      <EvalIntl>
        <EvalRunHistory runs={runs} onCompare={vi.fn()} renderDetails={(r) => <div>details of {r.id}</div>} />
      </EvalIntl>,
    );
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByText("2 errors")).toBeInTheDocument();
    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details for run v2" }));
    expect(screen.getByText("details of run-2")).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(
      <EvalIntl>
        <EvalRunHistory runs={[]} onCompare={vi.fn()} />
      </EvalIntl>,
    );
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
  });
});
