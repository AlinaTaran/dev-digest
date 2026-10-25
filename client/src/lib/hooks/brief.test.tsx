import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePrBrief, useGeneratePrBrief, briefErrorReason, BRIEF_POLL_MS } from "./brief";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("../api", async () => ({ ...(await vi.importActual<object>("../api")), api: { get, post } }));
import { ApiError } from "../api";

const resp = (generating: boolean) => ({
  pr_id: "p1",
  brief: null,
  generating,
  stale: false,
  current_head_sha: "abc",
});

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("PR brief hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    get.mockReset();
    post.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("polls every 2s only while generating, then stops (AC-9)", async () => {
    get.mockResolvedValueOnce(resp(true)).mockResolvedValueOnce(resp(true)).mockResolvedValue(resp(false));
    renderHook(() => usePrBrief("p1"), { wrapper: wrapperFor(newClient()) });
    await tick(0);
    expect(get).toHaveBeenCalledTimes(1);
    await tick(BRIEF_POLL_MS - 500);
    expect(get).toHaveBeenCalledTimes(1);
    await tick(1000);
    expect(get).toHaveBeenCalledTimes(2);
    await tick(BRIEF_POLL_MS + 500);
    expect(get).toHaveBeenCalledTimes(3);
    await tick(BRIEF_POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("does not fetch while the PR id is unresolved", async () => {
    renderHook(() => usePrBrief(null), { wrapper: wrapperFor(newClient()) });
    await tick(0);
    expect(get).not.toHaveBeenCalled();
  });

  it("sends one POST for a double generate() in the same tick (AC-6)", async () => {
    post.mockResolvedValue(resp(false));
    get.mockResolvedValue(resp(false));
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper: wrapperFor(newClient()) });
    act(() => {
      result.current.generate();
      result.current.generate();
    });
    await tick(0);
    expect(post).toHaveBeenCalledTimes(1);
    // the guard resets after settling, so a later generate() posts again
    act(() => result.current.generate());
    await tick(0);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("exposes the failure reason from ApiError details, else unknown", async () => {
    post.mockRejectedValue(new ApiError("boom", 502, "x", { reason: "llm_failed" }));
    get.mockResolvedValue(resp(false));
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper: wrapperFor(newClient()) });
    act(() => result.current.generate());
    await tick(0);
    expect(result.current.errorReason).toBe("llm_failed");
    expect(briefErrorReason(new Error("net"))).toBe("unknown");
  });
});
