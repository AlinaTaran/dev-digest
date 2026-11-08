import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEvalRun, useStartAgentEvalRun, useStartSkillEvalRun, useCreateEvalCaseFromFinding, useEvalTargets } from "./eval";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("../api", async () => ({
  ...(await vi.importActual<typeof import("../api")>("../api")),
  api: { get, post },
}));

import { ApiError } from "../api";

function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(hook, { wrapper }) };
}

const detail = (status: string) => ({ eval_run: { id: "r1", status }, results: [] });
const isStale = (qc: QueryClient, key: unknown[]) => qc.getQueryState(key)?.isInvalidated;

describe("useEvalRun polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    get.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("polls every 2s while running, stops and invalidates run data once on terminal status", async () => {
    get.mockResolvedValueOnce(detail("running")).mockResolvedValueOnce(detail("running")).mockResolvedValue(detail("done"));
    const { qc, result } = setup(() => useEvalRun("r1"));
    qc.setQueryData(["eval-overview"], {});
    qc.setQueryData(["eval-runs", "agent", "a1", 30], []);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(get).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(get).toHaveBeenCalledTimes(2);
    expect(isStale(qc, ["eval-overview"])).toBeFalsy();
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(get).toHaveBeenCalledTimes(3);
    expect(result.current.data?.eval_run.status).toBe("done");
    expect(isStale(qc, ["eval-overview"])).toBe(true);
    expect(isStale(qc, ["eval-runs", "agent", "a1", 30])).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(get).toHaveBeenCalledTimes(3);
  });
});

describe("useStartAgentEvalRun", () => {
  beforeEach(() => post.mockReset());

  it("invalidates run data after start despite the 30s staleTime", async () => {
    post.mockResolvedValue({ eval_run: { id: "r1", status: "running" } });
    const { qc, result } = setup(() => useStartAgentEvalRun());
    qc.setQueryData(["eval-runs", "agent", "a1", 30], []);
    qc.setQueryData(["agent-eval-dashboard", "a1", 30], {});
    qc.setQueryData(["eval-cases", "agent", "a1"], []);
    await act(() => result.current.mutateAsync("a1"));
    expect(post).toHaveBeenCalledWith("/agents/a1/eval-runs");
    for (const k of [["eval-runs", "agent", "a1", 30], ["agent-eval-dashboard", "a1", 30], ["eval-cases", "agent", "a1"]]) {
      expect(isStale(qc, k)).toBe(true);
    }
  });

  it("maps 409 eval_run_in_progress to the active run id and rethrows other errors", async () => {
    post.mockRejectedValueOnce(new ApiError("busy", 409, "eval_run_in_progress", { active_run_id: "r9" }));
    const { result } = setup(() => useStartAgentEvalRun());
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync("a1");
    });
    expect(out).toEqual({ kind: "in_progress", activeRunId: "r9" });

    post.mockRejectedValueOnce(new ApiError("no", 409, "eval_run_unavailable", { reason: "no_cases" }));
    await act(async () => {
      await result.current.mutateAsync("a1").catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("shares one request across same-tick double calls", async () => {
    let resolve!: (v: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = setup(() => useStartAgentEvalRun());
    const [a, b] = await act(async () => {
      const p = [result.current.mutateAsync("a1"), result.current.mutateAsync("a1")];
      resolve({ eval_run: { id: "r1", status: "running" } });
      return Promise.all(p);
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});

describe("skill eval hooks", () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
  });

  it("starts a skill run with host_agent_id, folds in-progress 409 and invalidates run data", async () => {
    post.mockResolvedValueOnce({ eval_run: { id: "r1", status: "running" } });
    const { qc, result } = setup(() => useStartSkillEvalRun());
    qc.setQueryData(["eval-runs", "skill", "s1", 30], []);
    await act(() => result.current.mutateAsync({ skillId: "s1", hostAgentId: "a1" }));
    expect(post).toHaveBeenCalledWith("/skills/s1/eval-runs", { host_agent_id: "a1" });
    expect(isStale(qc, ["eval-runs", "skill", "s1", 30])).toBe(true);

    post.mockRejectedValueOnce(new ApiError("busy", 409, "eval_run_in_progress", { active_run_id: "r9" }));
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ skillId: "s1", hostAgentId: "a1" });
    });
    expect(out).toEqual({ kind: "in_progress", activeRunId: "r9" });
  });

  it("posts a finding eval case with an optional skill target", async () => {
    post.mockResolvedValue({ case: {}, created: true, owner_name: "S" });
    const { result } = setup(() => useCreateEvalCaseFromFinding());
    await act(() => result.current.mutateAsync("f1"));
    expect(post).toHaveBeenLastCalledWith("/findings/f1/eval-case");
    const target = { owner_kind: "skill" as const, owner_id: "00000000-0000-4000-8000-000000000001" };
    await act(() => result.current.mutateAsync({ findingId: "f1", target }));
    expect(post).toHaveBeenLastCalledWith("/findings/f1/eval-case", target);
  });

  it("loads eval targets", async () => {
    get.mockResolvedValue({ agent: { id: "a1", name: "A" }, skills: [] });
    const { result } = setup(() => useEvalTargets("f1"));
    await waitFor(() => expect(result.current.data?.agent?.name).toBe("A"));
    expect(get).toHaveBeenCalledWith("/findings/f1/eval-targets");
  });
});
