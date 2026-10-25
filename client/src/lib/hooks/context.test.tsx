import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePutAgentContext, usePutSkillContext } from "./context";

const put = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ api: { put } }));

// Same staleTime as the app's Providers: without explicit invalidation a reopened
// preview would keep showing the cached "used by N agents".
function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  qc.setQueryData(["context-doc", "r1", "docs/a.md"], { used_by_agents: [] });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(hook, { wrapper }) };
}

const docStale = (qc: QueryClient) => qc.getQueryState(["context-doc", "r1", "docs/a.md"])?.isInvalidated;

describe("context attach mutations", () => {
  beforeEach(() => put.mockReset());

  it("agent PUT invalidates cached doc details (used-by count)", async () => {
    put.mockResolvedValue({ repo_id: "r1", attached: [], inherited: [], effective: [], total_tokens: 0 });
    const { qc, result } = setup(() => usePutAgentContext());
    await act(() => result.current.mutateAsync({ agentId: "ag1", repo_id: "r1", paths: ["docs/a.md"] }));
    expect(docStale(qc)).toBe(true);
  });

  it("skill PUT invalidates cached doc details (used-by count)", async () => {
    put.mockResolvedValue({ repo_id: "r1", attached: [], total_tokens: 0, serialized: "" });
    const { qc, result } = setup(() => usePutSkillContext());
    await act(() => result.current.mutateAsync({ skillId: "sk1", repo_id: "r1", paths: ["docs/a.md"] }));
    expect(docStale(qc)).toBe(true);
  });
});
