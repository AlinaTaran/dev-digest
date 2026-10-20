import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistoryResponse } from "@/lib/types";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { PriorPrs } from "./PriorPrs";

const usePrHistory = vi.fn();
vi.mock("@/lib/hooks/pr-history", () => ({
  usePrHistory: (...a: unknown[]) => usePrHistory(...a),
}));

afterEach(() => {
  cleanup();
  usePrHistory.mockReset();
});

const ok = (data: PrHistoryResponse) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const item = (over = {}) => ({
  pr_number: 401,
  title: "Add token bucket",
  merged_at: "2026-09-30T10:12:00Z",
  author: "deepak.r",
  files_overlap: ["a.ts", "b.ts"],
  notes: "Introduces per-key buckets.",
  ...over,
});

function renderIt() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <PriorPrs prId="p1" repoFullName="o/r" />
    </NextIntlClientProvider>,
  );
}

describe("PriorPrs", () => {
  it("is lazy, then shows items with link, date, notes and touched fallback", () => {
    usePrHistory.mockImplementation((_id: string, enabled: boolean) =>
      enabled
        ? ok({ history: [item(), item({ pr_number: 402, title: "Second", notes: "" })], degraded: false, reason: null })
        : { data: undefined, isLoading: false, isError: false, refetch: vi.fn() },
    );
    renderIt();
    expect(usePrHistory).toHaveBeenLastCalledWith("p1", false);
    expect(screen.queryByText("Add token bucket")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(usePrHistory).toHaveBeenLastCalledWith("p1", true);
    expect(screen.getByRole("link", { name: "Open PR #401 on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/o/r/pull/401",
    );
    expect(screen.getAllByText(/merged 2026-09-30/)).toHaveLength(2);
    expect(screen.getByText("Introduces per-key buckets.")).toBeInTheDocument();
    expect(screen.getByText("Touched: a.ts, b.ts")).toBeInTheDocument();
  });

  it("shows degraded hint, empty state and error state", () => {
    usePrHistory.mockReturnValue(ok({ history: [], degraded: true, reason: "shallow_history" }));
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs/ }));
    expect(screen.getByText(/Resync to load history/)).toBeInTheDocument();
    cleanup();

    usePrHistory.mockReturnValue(ok({ history: [], degraded: false, reason: null }));
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs/ }));
    expect(screen.getByText("No prior PRs touched these files.")).toBeInTheDocument();
    cleanup();

    usePrHistory.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load PR history");
  });
});
