import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { EvalIntl } from "../test-kit";
import { evalCase, result } from "../fixtures";
import { EvalCaseEditorModal } from "./EvalCaseEditorModal";

afterEach(cleanup);

const DIFF = "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,2 +10,3 @@\n a\n+stripeKey\n b";
const existing = evalCase("c1", "stripe-key-leak", result({ pass: true, expected_count: 1, got_count: 1, duration_ms: 1800, cost_usd: 0.02 }), {
  input_diff: DIFF,
  input_meta: { repo: "r", pr_number: 1, title: "Add Stripe", body: "Wire it", head_sha: "x", source: null },
  expected_output: [{ expect: "must_find", file: "src/config.ts", start_line: 11 }],
});

function setup(over: Partial<React.ComponentProps<typeof EvalCaseEditorModal>> = {}) {
  const calls: string[] = [];
  const onSave = vi.fn(async () => {
    calls.push("save");
    return { id: "c1" };
  });
  const onRun = vi.fn(async () => {
    calls.push("run");
  });
  const onClose = vi.fn();
  render(
    <EvalIntl>
      <EvalCaseEditorModal onSave={onSave} onRun={onRun} onClose={onClose} {...over} />
    </EvalIntl>,
  );
  return { calls, onSave, onRun, onClose };
}

const jsonBox = () => screen.getByRole("textbox", { name: "Expected output JSON" }) as HTMLTextAreaElement;
const save = () => screen.getByRole("button", { name: /^Save$/ });

describe("EvalCaseEditorModal", () => {
  it("edit pre-fills the controls and shows the last-run strip (AC-18/24)", () => {
    setup({ initialCase: existing, subtitle: "Security Reviewer · simulate a PR" });
    expect(screen.getByText("Eval case · stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer · simulate a PR")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("stripe-key-leak");
    expect(screen.getByRole("textbox", { name: "Case diff (unified)" })).toHaveValue(DIFF);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByText("Last run passed")).toBeInTheDocument();
    expect(screen.getByText(/expected 1 finding, got 1 · 1\.8s · \$0\.02/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Add Stripe");
  });

  it("skeleton keeps the JSON valid; invalid schema shows the path and blocks Save/Run (AC-19/20)", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "n" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    expect(JSON.parse(jsonBox().value)).toHaveLength(1);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(save()).toBeEnabled();

    fireEvent.change(jsonBox(), { target: { value: '[{"expect":"maybe"}]' } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("[0].expect");
    expect(save()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Finding skeleton" })).toBeDisabled();
  });

  it("run on save is on by default: saves first, then runs, then closes (AC-23)", async () => {
    const { calls, onSave, onClose } = setup({ initialCase: existing });
    expect(screen.getByRole("switch")).toBeChecked();
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(["save", "run"]);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "stripe-key-leak" }), "c1");
  });

  it("turning run on save off only saves", async () => {
    const { calls, onClose } = setup({ initialCase: existing });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(["save"]);
  });

  it("renders a server 400 next to the Diff tab and stays open (AC-21)", async () => {
    const { onClose, onRun } = setup({ initialCase: existing });
    const onSave = vi.fn(async () => {
      throw new ApiError("diff has no hunks", 400);
    });
    cleanup();
    render(
      <EvalIntl>
        <EvalCaseEditorModal initialCase={existing} onSave={onSave} onRun={onRun} onClose={onClose} />
      </EvalIntl>,
    );
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Diff: diff has no hunks");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("warns when an expectation targets a file not in the diff (EC-24)", () => {
    setup({ initialCase: existing });
    fireEvent.change(jsonBox(), { target: { value: '[{"expect":"must_find","file":"other.ts","start_line":1}]' } });
    expect(screen.getByText(/file not in diff/)).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});
