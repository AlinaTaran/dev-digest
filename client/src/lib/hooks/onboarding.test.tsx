import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingTourResponse, OnboardingGeneration } from "@devdigest/shared";
import { useOnboardingTour, useGenerateOnboarding, useOnboardingResync } from "./onboarding";

const REPO = "r1";

function gen(status: OnboardingGeneration["status"]): OnboardingGeneration {
  return { id: "g1", status, started_at: "2026-10-25T10:00:00Z", finished_at: null, error_reason: null };
}
function response(status: OnboardingGeneration["status"] | null): OnboardingTourResponse {
  return {
    repo_id: REPO,
    tour: null,
    generation: status ? gen(status) : null,
    availability: { can_generate: true, reason: null },
    stale: false,
    current_index_sha: null,
  };
}
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

// Same staleTime as the app's Providers, so a missing invalidation can't hide.
function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(hook, { wrapper }) };
}

let state: OnboardingTourResponse;
let gets: number;
let resyncPosts: number;

beforeEach(() => {
  vi.useFakeTimers();
  gets = 0;
  resyncPosts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/onboarding/generate") && init?.method === "POST") {
        state = response("generating");
        return json({ generation: gen("generating") });
      }
      if (u.pathname.endsWith("/resync") && init?.method === "POST") {
        resyncPosts += 1;
        return json({ status: "accepted" });
      }
      if (u.pathname.endsWith("/index-state")) {
        return json({ status: "full", filesIndexed: 1, filesSkipped: 0, lastIndexedSha: "x", updatedAt: "t0" });
      }
      if (u.pathname.endsWith("/onboarding")) {
        gets += 1;
        return json(state);
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("onboarding hooks", () => {
  it("polls every 2s while generating and stops once done", async () => {
    state = response("generating");
    const { result } = setup(() => useOnboardingTour(REPO));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.data?.generation?.status).toBe("generating");
    expect(gets).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(gets).toBe(2);

    state = response("done");
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(result.current.data?.generation?.status).toBe("done");
    const settled = gets;

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(gets).toBe(settled);
  });

  it("does not fetch without a repo id", async () => {
    setup(() => useOnboardingTour(undefined));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(gets).toBe(0);
  });

  it("generate flips the cached tour to generating and starts polling despite staleTime", async () => {
    state = response(null);
    const { result } = setup(() => ({ tour: useOnboardingTour(REPO), generate: useGenerateOnboarding() }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.tour.data?.generation).toBeNull();

    await act(() => result.current.generate.mutateAsync(REPO));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.tour.data?.generation?.status).toBe("generating");
    const afterGenerate = gets;
    expect(afterGenerate).toBeGreaterThanOrEqual(2); // invalidated, not served from the 30s cache

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(gets).toBeGreaterThan(afterGenerate);
  });

  it("resync waits for the index state, so the first poll is not mistaken for completion", async () => {
    state = response(null);
    const { result } = setup(() => useOnboardingResync(REPO));
    expect(result.current.canStart).toBe(false);
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(resyncPosts).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.canStart).toBe(true);
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(1600));
    expect(resyncPosts).toBe(1);
    expect(result.current.isResyncing).toBe(true); // same updatedAt: still running
  });
});
