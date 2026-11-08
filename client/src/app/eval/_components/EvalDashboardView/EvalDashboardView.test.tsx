import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { EvalOverview } from "@devdigest/shared";
import { EvalIntl } from "@/components/eval/test-kit";
import { suiteRun } from "@/components/eval/fixtures";

const overview = vi.fn();
const runAllMutate = vi.fn();
const runAllState = vi.fn();

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/eval", () => ({
  useEvalOverview: () => overview(),
  useRunAllEvals: () => ({ mutate: runAllMutate, isPending: false, isError: false, ...runAllState() }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

const agent = (id: string, name: string, model: string, n: number | null) => ({
  agent_id: id,
  name,
  model,
  cases_total: 20,
  last_run: n ? suiteRun({ n, owner_id: id, agent_id: id }) : null,
  recall_sparkline: n ? [0.5, 0.7, 0.82] : [],
});

const fixture = (over: Partial<EvalOverview> = {}): EvalOverview => ({
  agents: [
    agent("a1", "Security Reviewer", "gpt-4.1", 7),
    agent("a2", "Performance Reviewer", "gpt-4o", 4),
    agent("a3", "Custom Mentor", "gpt-4o-mini", null),
  ],
  recent_runs: [
    { ...suiteRun({ n: 9, owner_id: "a2" }), agent_name: "Performance Reviewer" },
    { ...suiteRun({ n: 8, owner_id: "a1" }), agent_name: "Security Reviewer" },
  ],
  ...over,
});

beforeEach(() => {
  overview.mockReturnValue({ data: fixture(), isLoading: false, isError: false, refetch: vi.fn() });
  runAllState.mockReturnValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderView = () =>
  render(
    <EvalIntl>
      <EvalDashboardView />
    </EvalIntl>,
  );

describe("EvalDashboardView", () => {
  it("renders a card per agent with model chip, last run, metrics and a link (AC-60)", () => {
    renderView();
    const card = screen.getByRole("link", { name: "Open Security Reviewer" });
    expect(card).toHaveAttribute("href", "/eval/a1");
    expect(within(card).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(card).getByText("Last run v7 · 2026-05-17 09:14 · 17/20 pass")).toBeInTheDocument();
    expect(within(card).getByText("82%")).toBeInTheDocument();
    expect(within(card).getByText("91%")).toBeInTheDocument();
    expect(within(card).getByText("95%")).toBeInTheDocument();
    const never = screen.getByRole("link", { name: "Open Custom Mentor" });
    expect(within(never).getByText("Never run")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("lists recent runs newest first and caps at 20 (AC-61)", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...suiteRun({ n: i + 1 }),
      id: `r${i}`,
      started_at: `2026-04-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      agent_name: `Agent ${i + 1}`,
    }));
    overview.mockReturnValue({ data: fixture({ recent_runs: many }), isLoading: false, isError: false, refetch: vi.fn() });
    renderView();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(20);
    expect(within(rows[0]!).getByText("Agent 25")).toBeInTheDocument();
    expect(within(rows[19]!).getByText("Agent 6")).toBeInTheDocument();
  });

  it("shows the empty state when no agent has cases (AC-62)", () => {
    overview.mockReturnValue({ data: fixture({ agents: [], recent_runs: [] }), isLoading: false, isError: false, refetch: vi.fn() });
    renderView();
    expect(screen.getByText("No agents have eval cases yet.")).toBeInTheDocument();
    expect(screen.getByText(/Turn into eval case/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all agents" })).toBeDisabled();
  });

  it("degrades to an error state with retry while the endpoint is unavailable", () => {
    const refetch = vi.fn();
    overview.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderView();
    expect(screen.getByText("Couldn't load eval metrics.")).toBeInTheDocument();
    expect(screen.queryByText("No agents have eval cases yet.")).not.toBeInTheDocument();
  });

  it("runs all agents and summarises started/skipped (AC-63)", () => {
    runAllState.mockReturnValue({
      data: { started: [suiteRun({ n: 1 }), suiteRun({ n: 2 })], skipped: [{ agent_id: "a3", reason: "in_progress" }] },
    });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(runAllMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Started 2 runs, skipped 1. (already running)");
  });
});
