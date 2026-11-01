import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

const replace = vi.hoisted(() => vi.fn());
let search = "";
let reviews: Partial<ReviewRecord>[] = [];

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/hooks", () => ({
  usePullDetail: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  usePulls: () => ({ data: [{ id: "p1", number: 7 }], isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviews, refetch: vi.fn() }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));

import { usePrDetailPage } from "./usePrDetailPage";

beforeEach(() => {
  replace.mockReset();
  search = "";
  reviews = [];
});

describe("usePrDetailPage brief navigation", () => {
  it("goToDiffTarget writes tab/file/line and setTab clears file and line", () => {
    search = "tab=overview";
    const { result } = renderHook(() => usePrDetailPage());
    result.current.goToDiffTarget("src/config.ts", 12);
    expect(replace).toHaveBeenLastCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Fconfig.ts&line=12");

    search = "tab=diff&file=src%2Fconfig.ts&line=12";
    const again = renderHook(() => usePrDetailPage());
    again.result.current.setTab("findings");
    expect(replace).toHaveBeenLastCalledWith("/repos/r1/pulls/7?tab=findings");
  });

  it("exposes the newest review that has a verdict", () => {
    reviews = [
      { id: "new", verdict: null, findings: [] },
      { id: "mid", verdict: "approve", findings: [] },
      { id: "old", verdict: "comment", findings: [] },
    ];
    const { result } = renderHook(() => usePrDetailPage());
    expect(result.current.latestVerdictReview?.id).toBe("mid");
  });
});
