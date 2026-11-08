import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import { evalMessages } from "@/components/eval/test-kit";
import common from "../../../../../../../../messages/en/common.json";
import { evalCase, result, suiteRun } from "@/components/eval/fixtures";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));

import { EvalsTab } from "./EvalsTab";
import { AgentEditor } from "../../AgentEditor";

const AGENT = { id: "agent-1", name: "Sec", provider: "openai", model: "gpt-4.1" } as Agent;
const json = (b: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }));

interface St {
  cases: ReturnType<typeof evalCase>[];
  runs: ReturnType<typeof suiteRun>[];
  startResponse: () => Promise<Response>;
  runDetail: () => ReturnType<typeof suiteRun>;
  calls: string[];
  bodies: Record<string, unknown>;
  createResponse: () => Promise<Response>;
}
let st: St;

const point = (n: number) => ({
  run_id: `run-${n}`,
  agent_version: n,
  ran_at: `2026-05-${10 + n}T09:00:00Z`,
  recall: 0.5 + n / 10,
  precision: 0.9,
  citation_accuracy: 0.95,
  pass_rate: 0.8,
  cost_usd: 0.2,
});
const dashboard = () => ({
  owner_kind: "agent",
  owner_id: "agent-1",
  cases_total: 2,
  current: { recall: 0.7, precision: 0.9, citation_accuracy: 0.95, traces_passed: 1, traces_total: 2, cost_usd: 0.2 },
  delta: { recall: 0.1, precision: 0, citation_accuracy: 0 },
  trend: [point(1), point(2)],
  recent_runs: [],
  alert: null,
});

function stub() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      const method = init?.method ?? "GET";
      st.calls.push(`${method} ${u.pathname}`);
      if (init?.body) st.bodies[`${method} ${u.pathname}`] = JSON.parse(String(init.body));
      if (u.pathname === "/agents/agent-1/eval-dashboard") return json(dashboard());
      if (u.pathname === "/agents/agent-1/eval-cases" && method === "POST") return st.createResponse();
      if (u.pathname === "/agents/agent-1" && method === "PUT") return json({ ...AGENT, system_prompt: "You are a reviewer." });
      if (u.pathname.match(/^\/eval-cases\/[^/]+$/) && method === "PUT") return json(evalCase("c1", "stripe-key-leak", null));
      if (u.pathname === "/agents/agent-1/eval-cases") return json(st.cases);
      if (u.pathname === "/agents/agent-1/eval-runs" && method === "GET") return json(st.runs);
      if (u.pathname === "/agents/agent-1/eval-runs" && method === "POST") return st.startResponse();
      if (u.pathname.startsWith("/eval-runs/")) return json({ eval_run: st.runDetail(), results: [] });
      if (u.pathname.match(/^\/eval-cases\/[^/]+\/run$/) && method === "POST") return json(result({ pass: true }));
      if (u.pathname.match(/^\/eval-cases\/[^/]+$/) && method === "DELETE") return json(null, 204);
      return json({ error: { code: "x", message: "unexpected " + u.pathname } }, 404);
    }),
  );
}

function renderTab(ui: React.ReactElement = <EvalsTab agent={AGENT} />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents, eval: evalMessages, common }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  query = "";
  st = {
    cases: [evalCase("c1", "stripe-key-leak", result({ pass: true })), evalCase("c2", "sql-injection", null)],
    runs: [suiteRun({ n: 1 }), suiteRun({ n: 2, metrics: { ...suiteRun().metrics!, recall: 0.9 } })],
    startResponse: () => json({ eval_run: suiteRun({ n: 3, status: "running", cases_done: 0, metrics: null }) }, 202),
    runDetail: () => suiteRun({ n: 3, status: "running", cases_done: 1, metrics: null }),
    calls: [],
    bodies: {},
    createResponse: () => json(evalCase("c9", "new-case", null), 201),
  };
  stub();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("EvalsTab", () => {
  it("shows tiles from the two latest runs and cases (AC-15..17, AC-47)", async () => {
    renderTab();
    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "RECALL" })).toHaveTextContent("90%");
  });

  it("links to the full dashboard and renders the trend (AC-56, AC-66)", async () => {
    renderTab();
    expect(await screen.findByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/agent-1");
    await waitFor(() => expect(st.calls).toContain("GET /agents/agent-1/eval-dashboard"));
  });

  it("creates a case from the New button and surfaces a server 400 (AC-18, AC-23)", async () => {
    st.createResponse = () => json({ error: { code: "validation", message: "bad diff" } }, 400);
    renderTab();
    await screen.findByText("stripe-key-leak");
    fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "new-case" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText(/bad diff/)).toBeInTheDocument();

    st.createResponse = () => json(evalCase("c9", "new-case", null), 201);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(st.bodies["POST /agents/agent-1/eval-cases"]).toMatchObject({ name: "new-case" });
  });

  it("opens the editor from a row Edit and saves via PUT", async () => {
    renderTab();
    await screen.findByText("stripe-key-leak");
    fireEvent.click(screen.getByRole("button", { name: "Edit eval case stripe-key-leak" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(st.calls).toContain("PUT /eval-cases/c1"));
  });

  it("opens the ?case= case in the editor (AC-10)", async () => {
    query = "case=c2";
    renderTab();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("sql-injection");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("compares two runs from the history (AC-50)", async () => {
    renderTab();
    await screen.findByText("stripe-key-leak");
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Compare runs");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Promote v/ }));
    await waitFor(() => expect(st.calls).toContain("PUT /agents/agent-1"));
    expect(st.bodies["PUT /agents/agent-1"]).toMatchObject({ system_prompt: "You are a reviewer.", model: "gpt-4.1" });
  });

  it("deletes a case after the inline confirm (AC-26)", async () => {
    renderTab();
    await screen.findByText("stripe-key-leak");
    fireEvent.click(screen.getByRole("button", { name: "Delete eval case stripe-key-leak" }));
    const group = screen.getByRole("group", { name: "Delete eval case stripe-key-leak" });
    fireEvent.click(within(group).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(st.calls).toContain("DELETE /eval-cases/c1"));
  });

  it("run-all shows progress, polls, and stops when the run finishes (AC-35/38/44)", async () => {
    renderTab();
    await screen.findByText("stripe-key-leak");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(await screen.findByRole("button", { name: /Running… 1\/20|Running… 0\/20/ })).toBeDisabled();

    st.runDetail = () => suiteRun({ n: 3, status: "done", cases_done: 20 });
    await act(() => vi.advanceTimersByTimeAsync(2500));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled());
  });

  it("surfaces a 409 'no API key' start failure inline (AC-39)", async () => {
    st.startResponse = () =>
      json({ error: { code: "eval_run_unavailable", message: "x", details: { reason: "llm_not_configured" } } }, 409);
    renderTab();
    await screen.findByText("stripe-key-leak");
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(await screen.findByText(/No LLM API key is configured/)).toBeInTheDocument();
  });

  it("highlights the ?case= row (Phase A deep link)", async () => {
    query = "case=c2";
    renderTab();
    await screen.findByText("sql-injection");
    expect(document.querySelector('[data-case-id="c2"]')).toHaveAttribute("data-highlighted", "true");
  });

  it("selects the Evals tab for tab=evals without falling back to Config (AC-14)", async () => {
    renderTab(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Evals/ })).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).toBeNull();
  });
});
