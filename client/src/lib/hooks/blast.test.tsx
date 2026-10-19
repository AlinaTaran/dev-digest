import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBlastResync, blastRadiusKey } from "./blast";
import { prHistoryKey } from "./pr-history";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ api: { get, post } }));

const state = (updatedAt: string) => ({ status: "full", filesIndexed: 1, filesSkipped: 0, lastIndexedSha: "x", updatedAt });
const stateCalls = () => get.mock.calls.filter(([url]) => String(url).includes("index-state")).length;

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useBlastResync("pr1", "repo1"), { wrapper });
  return { ...hook, invalidate };
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("useBlastResync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    get.mockReset();
    post.mockReset();
    post.mockResolvedValue({ status: "accepted" });
  });
  afterEach(() => vi.useRealTimers());

  it("blocks start until the index state has loaded", async () => {
    get.mockResolvedValue(state("t0"));
    const { result } = setup();
    expect(result.current.canStart).toBe(false);
    act(() => result.current.start());
    await tick(0);
    expect(post).not.toHaveBeenCalled();
    await tick(10);
    expect(result.current.canStart).toBe(true);
  });

  it("completes when updatedAt advances and invalidates blast + history", async () => {
    get.mockResolvedValue(state("t0"));
    const { result, invalidate } = setup();
    await tick(10);
    act(() => result.current.start());
    await tick(10);
    expect(result.current.isResyncing).toBe(true);
    get.mockResolvedValue(state("t1"));
    await tick(1600);
    expect(result.current.isResyncing).toBe(false);
    expect(result.current.timedOut).toBe(false);
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    expect(keys).toContain(JSON.stringify(blastRadiusKey("pr1")));
    expect(keys).toContain(JSON.stringify(prHistoryKey("pr1")));
  });

  it("does not complete while updatedAt is unchanged, then times out after 120s and stops polling", async () => {
    get.mockResolvedValue(state("t0"));
    const { result, invalidate } = setup();
    await tick(10);
    act(() => result.current.start());
    await tick(5000);
    expect(result.current.isResyncing).toBe(true);
    expect(invalidate.mock.calls.some(([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(blastRadiusKey("pr1")))).toBe(false);
    await tick(120_000);
    expect(result.current.isResyncing).toBe(false);
    expect(result.current.timedOut).toBe(true);
    const calls = stateCalls();
    await tick(10_000);
    expect(stateCalls()).toBe(calls);
  });

  it("reports a mutation error without polling", async () => {
    get.mockResolvedValue(state("t0"));
    post.mockRejectedValue(new Error("boom"));
    const { result } = setup();
    await tick(10);
    act(() => result.current.start());
    await tick(10);
    expect(result.current.isError).toBe(true);
    expect(result.current.isResyncing).toBe(false);
    const calls = stateCalls();
    await tick(10_000);
    expect(stateCalls()).toBe(calls);
  });
});
