import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EvalIntl } from "../test-kit";
import { suiteRun } from "../fixtures";
import { CompareRunsModal } from "./CompareRunsModal";

afterEach(cleanup);

const lines = (n: number) => Array.from({ length: n }, (_, i) => `rule ${i}`);

describe("CompareRunsModal", () => {
  it("orders older → newer, shows deltas, case-set change and a bounded collapsed prompt diff (AC-50/52)", () => {
    const old = suiteRun({ n: 1, case_ids: ["c1", "c2"] });
    const nu = suiteRun({ n: 2, case_ids: ["c2", "c3", "c4"] });
    old.config_snapshot.system_prompt = ["OLD HEAD", ...lines(10), "tail"].join("\n");
    nu.config_snapshot.system_prompt = ["NEW HEAD", ...lines(10), "tail"].join("\n");
    nu.metrics = { ...nu.metrics!, recall: 0.86, cost_usd: 0.25 };
    const onClose = vi.fn();
    render(
      <EvalIntl>
        <CompareRunsModal a={nu} b={old} onClose={onClose} footerExtra={<button>Promote v2</button>} />
      </EvalIntl>,
    );
    expect(screen.getByRole("dialog", { name: "Compare runs · v1 → v2" })).toBeInTheDocument();
    const recall = screen.getByRole("group", { name: "RECALL" });
    expect(within(recall).getByText("82%")).toBeInTheDocument();
    expect(within(recall).getByText("86%")).toBeInTheDocument();
    expect(within(recall).getByLabelText("up 4 points")).toBeInTheDocument();
    expect(screen.getByText("$0.25")).toBeInTheDocument();
    expect(screen.getByText(/▲\s*\$0\.02/)).toBeInTheDocument();
    expect(screen.getByText("Old prompt vs new — metric deltas and prompt diff on the 3-case set")).toBeInTheDocument();
    expect(screen.getByText("v1 (old)")).toBeInTheDocument();
    expect(screen.getByText("v2 (new)")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "CITATION" })).toBeInTheDocument();
    expect(screen.getByText("Case set changed: +2 / −1 cases")).toBeInTheDocument();
    expect(screen.getByText("OLD")).toHaveAttribute("data-kind", "del");
    expect(screen.getByText("NEW")).toHaveAttribute("data-kind", "add");
    expect(screen.getByRole("button", { name: "Promote v2" })).toBeInTheDocument();
    const closers = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closers[closers.length - 1]!);
    expect(onClose).toHaveBeenCalled();
  });

  it("says the prompt is unchanged and lists config differences or none (AC-53)", () => {
    const a = suiteRun({ n: 1 });
    const b = suiteRun({ n: 2 });
    const { rerender } = render(
      <EvalIntl>
        <CompareRunsModal a={a} b={b} onClose={vi.fn()} />
      </EvalIntl>,
    );
    expect(screen.getByText("System prompt unchanged")).toBeInTheDocument();
    expect(screen.getByText("No config changes")).toBeInTheDocument();

    b.config_snapshot.model = "gpt-5";
    rerender(
      <EvalIntl>
        <CompareRunsModal a={a} b={b} onClose={vi.fn()} />
      </EvalIntl>,
    );
    expect(screen.getByText("System prompt unchanged")).toBeInTheDocument();
    expect(screen.queryByText("No config changes")).toBeNull();
    expect(screen.getByText("Model: gpt-4.1 → gpt-5")).toBeInTheDocument();
  });
});

describe("CompareRunsModal skill mode", () => {
  it("diffs skill_body and warns when host agents differ", () => {
    const snap = suiteRun().config_snapshot;
    const mk = (n: number, body: string, agent: string) =>
      suiteRun({ n, owner_kind: "skill", agent_id: agent, host_agent_name: `Host ${agent}`, config_snapshot: { ...snap, skill_body: body } });
    render(
      <EvalIntl>
        <CompareRunsModal mode="skill" a={mk(1, "line one", "a1")} b={mk(2, "line two", "a2")} onClose={() => {}} />
      </EvalIntl>,
    );
    expect(screen.getByText("Skill body diff")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Different host agents — metrics are not directly comparable (Host a1 vs Host a2)",
    );
    // AC-84: explicit config-difference list incl. the host agent change, alongside the body diff.
    expect(screen.getByText("Host agent changed: Host a1 → Host a2")).toBeInTheDocument();
    cleanup();

    render(
      <EvalIntl>
        <CompareRunsModal mode="skill" a={mk(1, "same", "a1")} b={mk(2, "same", "a1")} onClose={() => {}} />
      </EvalIntl>,
    );
    expect(screen.getByText("Skill body unchanged")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Host agent changed/)).toBeNull();
  });

  it("lists host agent and host prompt changes when the skill body is unchanged (AC-84)", () => {
    const snap = suiteRun().config_snapshot;
    const mk = (n: number, agent: string, prompt: string) =>
      suiteRun({
        n,
        owner_kind: "skill",
        agent_id: agent,
        host_agent_name: `Host ${agent}`,
        config_snapshot: { ...snap, skill_body: "same", system_prompt: prompt, agent_name: `Host ${agent}` },
      });
    render(
      <EvalIntl>
        <CompareRunsModal mode="skill" a={mk(1, "a1", "p1")} b={mk(2, "a2", "p2")} onClose={() => {}} />
      </EvalIntl>,
    );
    expect(screen.getByText("Skill body unchanged")).toBeInTheDocument();
    expect(screen.queryByText("No config changes")).toBeNull();
    expect(screen.getByText("Host agent changed: Host a1 → Host a2")).toBeInTheDocument();
    expect(screen.getByText("Host agent prompt changed")).toBeInTheDocument();
  });
});
