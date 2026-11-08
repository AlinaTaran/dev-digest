import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EvalIntl } from "../test-kit";
import { HostAgentPicker } from "./HostAgentPicker";

afterEach(cleanup);

const agents = [
  { id: "a1", name: "Security Reviewer" },
  { id: "a2", name: "Perf Reviewer" },
];

describe("HostAgentPicker", () => {
  it("lists agents, reflects the value and reports changes; shows a hint with no agents", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EvalIntl>
        <HostAgentPicker agents={agents} value="a1" onChange={onChange} />
      </EvalIntl>,
    );
    const select = screen.getByRole("combobox", { name: "Host agent" });
    expect(select).toHaveValue("a1");
    fireEvent.change(select, { target: { value: "a2" } });
    expect(onChange).toHaveBeenCalledWith("a2");

    rerender(
      <EvalIntl>
        <HostAgentPicker agents={[]} value={null} onChange={onChange} />
      </EvalIntl>,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("Link this skill to an agent");
  });
});
