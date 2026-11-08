import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EvalIntl } from "../test-kit";
import { evalCase, result } from "../fixtures";
import { EvalCaseList } from "./EvalCaseList";

afterEach(cleanup);

const XSS_NAME = "<img src=x onerror=alert(1)>";
const cases = [
  evalCase("c1", "stripe-key-leak", result({ pass: true })),
  evalCase("c2", "sql-injection", result({ pass: false, expected_count: 2, got_count: 1, recall: 0.5 })),
  evalCase("c3", "timeout-case", result({ pass: false, error: { reason: "timeout", message: "x" } })),
  evalCase("c4", "never-run", null, { expected_output: [] }),
  evalCase("c5", XSS_NAME, null, { expected_output: [{ expect: "must_not_flag", file: "a.ts", start_line: 2 }] }),
];

const baseProps = {
  runAll: { onStart: vi.fn() },
  onRunCase: vi.fn(),
  onDelete: vi.fn(),
};

describe("EvalCaseList", () => {
  it("shows counter, row states as text, chips and escapes case names (AC-15/16/71, NFR-5)", () => {
    render(
      <EvalIntl>
        <EvalCaseList cases={cases} {...baseProps} />
      </EvalIntl>,
    );
    expect(screen.getByText("1 / 5 passing")).toBeInTheDocument();
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText(/expected 2 findings, got 1/)).toBeInTheDocument();
    expect(screen.getByText("error: timed out")).toBeInTheDocument();
    expect(screen.getAllByText("never run")).toHaveLength(2);
    expect(screen.getAllByText("assert empty")).toHaveLength(2);
    expect(screen.getAllByText("must find")).toHaveLength(3);
    expect(screen.getAllByText("must not flag")).toHaveLength(2);
    // literal text, no element injected
    expect(screen.getByText(XSS_NAME)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    // accessible names include the case name; Edit/New hidden without handlers
    expect(screen.getByRole("button", { name: "Run eval case stripe-key-leak" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit eval case/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "New eval case" })).toBeNull();
  });

  it("requires confirmation before deleting (AC-26) and wires Run / Edit / New", () => {
    const onDelete = vi.fn();
    const onRunCase = vi.fn();
    const onEdit = vi.fn();
    const onNew = vi.fn();
    render(
      <EvalIntl>
        <EvalCaseList cases={cases.slice(0, 1)} {...baseProps} onDelete={onDelete} onRunCase={onRunCase} onEdit={onEdit} onNew={onNew} />
      </EvalIntl>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run eval case stripe-key-leak" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit eval case stripe-key-leak" }));
    fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
    expect(onRunCase).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onNew).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Delete eval case stripe-key-leak" }));
    expect(onDelete).not.toHaveBeenCalled();
    const group = screen.getByRole("group", { name: "Delete eval case stripe-key-leak" });
    fireEvent.click(within(group).getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete eval case stripe-key-leak" }));
    fireEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(cases[0]);
  });

  it("empty state disables Run all (AC-17); active run shows progress (AC-38)", () => {
    const { rerender } = render(
      <EvalIntl>
        <EvalCaseList cases={[]} {...baseProps} />
      </EvalIntl>,
    );
    expect(screen.getByText(/No eval cases yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.getByText("0 / 0 passing")).toBeInTheDocument();

    rerender(
      <EvalIntl>
        <EvalCaseList cases={cases} {...baseProps} runAll={{ onStart: vi.fn(), progress: { done: 2, total: 5 } }} />
      </EvalIntl>,
    );
    expect(screen.getByRole("button", { name: /Running… 2\/5/ })).toBeDisabled();
  });

  it("marks the highlighted row", () => {
    render(
      <EvalIntl>
        <EvalCaseList cases={cases} {...baseProps} highlightCaseId="c2" />
      </EvalIntl>,
    );
    const row = document.querySelector('[data-case-id="c2"]') as HTMLElement;
    expect(row).toHaveAttribute("data-highlighted", "true");
    expect(row).toHaveFocus();
  });
});
