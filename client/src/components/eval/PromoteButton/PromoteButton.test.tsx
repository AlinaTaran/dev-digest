import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import { api } from "@/lib/api";
import { EvalIntl } from "../test-kit";
import { suiteRun } from "../fixtures";
import { PromoteButton } from "./PromoteButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const older = suiteRun({ n: 1 });
const newer = suiteRun({ n: 2 });
const agentFrom = (snap: typeof newer.config_snapshot, over: Partial<Agent> = {}): Agent =>
  ({ id: "agent-1", name: "A", description: "", provider: snap.provider, model: snap.model, system_prompt: snap.system_prompt, strategy: snap.strategy, enabled: true, version: 3, ci_fail_on: "critical", repo_intel: true, ...over }) as Agent;

const renderIt = (agent: Agent) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EvalIntl>
        <PromoteButton agent={agent} a={older} b={newer} />
      </EvalIntl>
    </QueryClientProvider>,
  );

describe("PromoteButton", () => {
  it("is absent when the newer snapshot equals the current config (AC-54)", () => {
    renderIt(agentFrom(newer.config_snapshot));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("applies the snapshot via PUT /agents/:id and confirms (AC-54)", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ id: "agent-1" });
    renderIt(agentFrom(newer.config_snapshot, { system_prompt: "old prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Promote v2" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Promoted v2"));
    expect(put).toHaveBeenCalledWith(
      "/agents/agent-1",
      expect.objectContaining({ system_prompt: newer.config_snapshot.system_prompt, model: newer.config_snapshot.model }),
    );
  });
});
