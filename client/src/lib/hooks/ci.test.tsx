import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useExportCiZip, useRefreshCiRuns } from "./ci";

const post = vi.hoisted(() => vi.fn());
const postBlob = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ api: { post, postBlob } }));

// Same staleTime as the app's Providers: without explicit invalidation a remounted
// query would keep showing stale CI data for 30 s.
function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  qc.setQueryData(["agent-ci", "a1"], { ci_fail_on: "never", installations: [] });
  qc.setQueryData(["ci-runs"], { items: [] });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(hook, { wrapper }) };
}
const stale = (qc: QueryClient, key: unknown[]) => qc.getQueryState(key)?.isInvalidated;

describe("ci hooks", () => {
  beforeEach(() => {
    post.mockReset();
    postBlob.mockReset();
  });

  it("zip export posts action=zip, downloads the blob and invalidates the agent's CI tab", async () => {
    postBlob.mockResolvedValue(new Blob(["zip"]));
    const createObjectURL = vi.fn(() => "blob:x");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { qc, result } = setup(() => useExportCiZip("a1"));

    await act(() => result.current.mutateAsync({ repo: "acme/web", post_as: "none" }));

    expect(postBlob).toHaveBeenCalledWith("/agents/a1/export-ci", { repo: "acme/web", post_as: "none", action: "zip" });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(stale(qc, ["agent-ci", "a1"])).toBe(true);
    click.mockRestore();
  });

  it("refresh invalidates both the CI runs list and every agent's CI tab", async () => {
    post.mockResolvedValue({ ingested: 1, errors: [] });
    const { qc, result } = setup(() => useRefreshCiRuns());
    await act(() => result.current.mutateAsync());
    expect(post).toHaveBeenCalledWith("/ci/runs/refresh");
    expect(stale(qc, ["ci-runs"])).toBe(true);
    expect(stale(qc, ["agent-ci", "a1"])).toBe(true);
  });
});
