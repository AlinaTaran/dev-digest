import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalDashboard } from "@devdigest/shared";
import { EvalIntl } from "@/components/eval/test-kit";
import { result, suiteRun } from "@/components/eval/fixtures";

const replace = vi.fn();
const push = vi.fn();
let query = "";
const dashboardHook = vi.fn();
const startMutate = vi.fn();
const runHook = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/eval/a1",
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/eval/EvalTrendChart/EvalTrendChart", () => ({
  EvalTrendChart: ({ points }: { points: unknown[] }) => <div data-testid="trend">{points.length} points</div>,
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => ({
    data: { id: "a1", name: "Security Reviewer", model: "gpt-4.1", provider: "openai", system_prompt: "x", strategy: "single" },
  }),
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security Reviewer" },
      { id: "a2", name: "Performance Reviewer" },
    ],
  }),
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalDashboard: (id: string, days: number) => dashboardHook(id, days),
  useStartAgentEvalRun: () => ({ mutate: startMutate, isPending: false }),
  useEvalRun: (id: string | null) => runHook(id),
  evalRunUnavailableReason: () => undefined,
}));

import { AgentEvalDashboardView } from "./AgentEvalDashboardView";

const point = (n: number) => ({
  run_id: `run-${n}`,
  agent_version: n,
  ran_at: `2026-05-${10 + n}T09:00:00Z`,
  recall: 0.8,
  precision: 0.9,
  citation_accuracy: 0.95,
  pass_rate: 0.85,
  cost_usd: 0.2,
});

const dash = (runs: number[], over: Partial<EvalDashboard> = {}): { data: EvalDashboard; isLoading: boolean; isError: boolean; refetch: () => void } => ({
  data: {
    owner_kind: "agent",
    owner_id: "a1",
    cases_total: 20,
    current: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95, traces_passed: 17, traces_total: 20, cost_usd: 0.2 },
    delta: { recall: 0.04, precision: 0, citation_accuracy: 0 },
    trend: runs.map(point),
    recent_runs: runs.map((n) => suiteRun({ n })),
    alert: null,
    ...over,
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

beforeEach(() => {
  query = "";
  runHook.mockReturnValue({ data: undefined });
  dashboardHook.mockImplementation((_id: string, days: number) => (days === 7 ? dash([3, 4]) : dash([1, 2, 3, 4])));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const view = () => (
  <EvalIntl>
    <AgentEvalDashboardView agentId="a1" />
  </EvalIntl>
);

describe("AgentEvalDashboardView", () => {
  it("shows the header, tiles and runs; switching 30 to 7 days refetches with days=7 (AC-64)", () => {
    const { rerender } = render(view());
    expect(dashboardHook).toHaveBeenLastCalledWith("a1", 30);
    expect(screen.getByRole("heading", { level: 1, name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("4 runs on the 20-case set")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Period: 30 days" }));
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(replace).toHaveBeenCalledWith("/eval/a1?days=7");

    query = "days=7";
    rerender(view());
    expect(dashboardHook).toHaveBeenLastCalledWith("a1", 7);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("2 runs on the 20-case set")).toBeInTheDocument();
  });

  it("navigates when another agent is selected", () => {
    render(view());
    fireEvent.click(screen.getByRole("button", { name: /^Agent: / }));
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent === "Performance Reviewer")!);
    expect(push).toHaveBeenCalledWith("/eval/a2?days=30");
  });

  it("starts a run from Run eval", () => {
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(startMutate).toHaveBeenCalledWith("a1", expect.any(Object));
  });

  it("renders the alert banner only when the dashboard has an alert (AC-65)", () => {
    dashboardHook.mockReturnValue(dash([1, 2], { alert: "Recall dropped 5 points" }));
    render(view());
    expect(screen.getByRole("alert")).toHaveTextContent("Recall dropped 5 points");
  });

  it("compares two runs and offers Promote when the config differs (AC-54)", () => {
    const a = suiteRun({ n: 1 });
    const b = suiteRun({ n: 2, config_snapshot: { ...suiteRun().config_snapshot, system_prompt: "New prompt" } });
    dashboardHook.mockReturnValue(dash([1, 2], { recent_runs: [a, b] }));
    render(view());
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("button", { name: "Promote v2" })).toBeInTheDocument();
  });

  it("shows the empty state with a widen link when the period has no runs (EC-28)", () => {
    query = "days=7";
    dashboardHook.mockImplementation((_id: string, days: number) => (days === 90 ? dash([1]) : dash([])));
    render(view());
    expect(screen.getByText(/No runs in the last 7 days/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 90 days" }));
    expect(replace).toHaveBeenCalledWith("/eval/a1?days=90");
  });

  it("expands a run row to show its per-case results (AC-55)", () => {
    const run = suiteRun({ n: 1 });
    dashboardHook.mockReturnValue(dash([1], { recent_runs: [run] }));
    runHook.mockImplementation((id: string | null) =>
      id === run.id
        ? { data: { eval_run: run, results: [result({ case_name: "SQL injection case" })] } }
        : { data: undefined },
    );
    render(view());
    expect(screen.queryByText("SQL injection case")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details for run v1" }));
    expect(screen.getByText("SQL injection case")).toBeInTheDocument();
    expect(runHook).toHaveBeenCalledWith(run.id);
  });
});
