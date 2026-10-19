import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@/lib/types";
import { githubBlobUrl } from "@/lib/github-urls";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusPanel } from "./BlastRadiusPanel";

const useBlastRadius = vi.fn();
const start = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: (...a: unknown[]) => useBlastRadius(...a),
  useBlastResync: () => ({ start, canStart: true, isResyncing: false, timedOut: false, isError: false }),
}));
vi.mock("@/lib/hooks/pr-history", () => ({
  usePrHistory: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  useBlastRadius.mockReset();
  start.mockReset();
});

const base = (over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse => ({
  changed_symbols: [{ name: "reviewToDto", file: "s/helpers.ts", kind: "function" }],
  downstream: [
    {
      symbol: "reviewToDto",
      file: "s/helpers.ts",
      kind: "function",
      rank: 0.8,
      callers: [
        { name: "listReviews", file: "s/service.ts", line: 57, rank: 0.8, endpoints: ["GET /r"], crons: [] },
        { name: "executeRun", file: "s/run.ts", line: 211, rank: 0.6, endpoints: [], crons: ["job:run"] },
      ],
      callers_total: 2,
      truncated: false,
      endpoints_affected: ["GET /r"],
      crons_affected: ["job:run"],
    },
  ],
  impacted_endpoints: ["GET /r"],
  summary: "",
  stats: { symbols: 1, callers: 2, endpoints: 1, crons: 1 },
  degraded: false,
  reason: null,
  max_callers_per_symbol: 20,
  bfs_depth: 2,
  indexed_sha: "abc123",
  ...over,
});

function renderIt(onViewChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadiusPanel
        prId="p1"
        repoId="r1"
        repoFullName="o/r"
        headSha="head"
        view="tree"
        onViewChange={onViewChange}
      />
    </NextIntlClientProvider>,
  );
  return onViewChange;
}

describe("BlastRadiusPanel", () => {
  it("renders stats, symbol, caller link, separate chip groups, collapse and graph toggle", () => {
    useBlastRadius.mockReturnValue({ data: base(), isLoading: false, isError: false, refetch: vi.fn() });
    const onViewChange = renderIt();

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("reviewToDto()")).toBeInTheDocument();
    expect(screen.getByText("2 callers")).toBeInTheDocument();
    const toggle = screen.getByRole("group", { name: "Blast radius view" });
    expect(within(toggle).getByRole("button", { name: "tree" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByRole("link", { name: "s/service.ts:57" })).toHaveAttribute(
      "href",
      githubBlobUrl("o/r", "abc123", "s/service.ts", 57),
    );
    expect(screen.getByRole("link", { name: "s/service.ts:57" }).getAttribute("href")).toMatch(/#L57$/);
    expect(within(screen.getByRole("group", { name: "Endpoints" })).getByText("GET /r")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Cron / jobs" })).getByText("job:run")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse reviewToDto" }));
    expect(screen.queryByText("s/service.ts:57")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand reviewToDto" }));
    expect(screen.getByText("s/service.ts:57")).toBeInTheDocument();

    fireEvent.click(within(toggle).getByRole("button", { name: "graph" }));
    expect(onViewChange).toHaveBeenCalledWith("graph");
  });

  it("shows the degraded badge + reason, Resync calls start, and zero callers text", () => {
    useBlastRadius.mockReturnValue({
      data: base({
        degraded: true,
        reason: "index_partial",
        stats: { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
        downstream: [{ ...base().downstream[0]!, callers: [], callers_total: 0, endpoints_affected: [], crons_affected: [] }],
        impacted_endpoints: [],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderIt();

    expect(screen.getByText("Index incomplete")).toBeInTheDocument();
    expect(screen.getByText(/Index is partial/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resync/ }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 changed symbol, no downstream callers found.")).toBeInTheDocument();
    expect(screen.getByText("No callers found in the indexed code.")).toBeInTheDocument();
  });

  it("shows an error state and retries", () => {
    const refetch = vi.fn();
    useBlastRadius.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderIt();
    expect(screen.getByText("Couldn't load blast radius")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
