import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EvalIntl } from "../test-kit";
import { RunEvalButton } from "./RunEvalButton";

afterEach(cleanup);

describe("RunEvalButton", () => {
  it("starts a run, shows progress and the llm_not_configured link (AC-38/44)", () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <EvalIntl>
        <RunEvalButton onStart={onStart} />
      </EvalIntl>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(onStart).toHaveBeenCalledOnce();

    rerender(
      <EvalIntl>
        <RunEvalButton onStart={onStart} progress={{ done: 1, total: 4 }} notice="in_progress" />
      </EvalIntl>,
    );
    expect(screen.getByRole("button", { name: /Running… 1\/4/ })).toBeDisabled();
    expect(screen.getByText("A run is already in progress.")).toBeInTheDocument();

    rerender(
      <EvalIntl>
        <RunEvalButton onStart={onStart} notice="llm_not_configured" />
      </EvalIntl>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No LLM API key is configured");
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
  });
});
