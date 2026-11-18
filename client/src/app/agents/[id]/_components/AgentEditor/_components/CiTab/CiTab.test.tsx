import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import ci from "../../../../../../../../messages/en/ci.json";
import common from "../../../../../../../../messages/en/common.json";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(""), usePathname: () => "/agents/a1" }));

import { AgentEditor } from "../../AgentEditor";
import { CiTab } from "./CiTab";

const AGENT = { id: "a1", name: "Security Reviewer", provider: "openrouter", model: "m", ci_fail_on: "critical" } as Agent;
const json = (b: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }));
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const run = (n: number, minsAgo: number, over: Record<string, unknown> = {}) => ({
  id: `r${n}`,
  ci_installation_id: "i1",
  repo: "acme/payments-api",
  agent_id: "a1",
  pr_number: n,
  ran_at: ago(minsAgo),
  status: "succeeded",
  verdict: "comment",
  findings_count: n,
  critical: 0,
  warning: 0,
  suggestion: 0,
  run_attempt: 1,
  cost_usd: 0.01,
  github_url: "https://github.com/acme/payments-api/actions/runs/1",
  source: "ci",
  agent: "Security Reviewer",
  duration_s: 40,
  ...over,
});

const inst = (id: string, repo: string, runs: ReturnType<typeof run>[]) => ({
  id,
  agent_id: "a1",
  repo,
  target_type: "gha",
  installed_at: ago(5000),
  workflow_file: "devdigest-review-security-reviewer.yml",
  runner_version: "1.0.0",
  pr_url: "https://github.com/acme/payments-api/pull/9",
  recent_runs: runs,
});

let installations: ReturnType<typeof inst>[];
let calls: { method: string; path: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  installations = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push({ method, path: u.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.pathname === "/agents/a1/ci") return json({ ci_fail_on: "critical", installations });
      if (u.pathname === "/agents/a1" && method === "PUT") return json({ ...AGENT, ci_fail_on: "any", version: 2 });
      if (u.pathname === "/repos") return json([]);
      return json({ error: { code: "x", message: "unexpected " + u.pathname } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderUi(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents, ci, common }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CiTab", () => {
  it("lists installations with their fields, expands recent runs newest-first and saves Fail CI on", async () => {
    // 12 runs in shuffled order: the row must show the newest 10 only.
    const runs = Array.from({ length: 12 }, (_, i) => run(i + 1, (i + 1) * 60));
    installations = [inst("i1", "acme/payments-api", [runs[3]!, ...runs.filter((r) => r !== runs[3]).reverse()]), inst("i2", "acme/web", [])];
    renderUi(<AgentEditor agent={AGENT} tab="ci" onTab={() => {}} />);

    // AC-1: the tab follows Evals; AC-2: heading, badge, both buttons.
    const tabNames = screen.getAllByRole("button").map((b) => b.textContent);
    expect(tabNames.indexOf("CI")).toBe(tabNames.indexOf("Evals") + 1);
    expect(await screen.findByText("CI deployment")).toBeInTheDocument();
    expect(screen.getByText("Active in 2 repos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update CI config" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to CI" })).toBeInTheDocument();

    // AC-4 / AC-94: row fields + "+ Add repository".
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getAllByText("GitHub Actions")).toHaveLength(2);
    expect(screen.getAllByText("workflow v1.0.0")).toHaveLength(2);
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View PR" })[0]!.getAttribute("href")).toBe("https://github.com/acme/payments-api/pull/9");
    expect(screen.getByRole("button", { name: "Add repository" })).toBeInTheDocument();

    // AC-7: expand → at most 10 runs, newest first.
    fireEvent.click(screen.getByRole("button", { name: "Show recent runs for acme/payments-api" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1]!.textContent)).toEqual(
      Array.from({ length: 10 }, (_, i) => `#${i + 1}`),
    );

    // AC-8: Fail CI on shows the agent value and saves through PUT /agents/:id.
    const select = screen.getByLabelText(/Fail CI on/);
    expect(select).toHaveValue("critical");
    fireEvent.change(select, { target: { value: "any" } });
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/agents/a1")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ ci_fail_on: "any" });
  });

  it("shows the empty state, and every entry button opens the wizard at step 1 of 4", async () => {
    renderUi(<CiTab agent={AGENT} />);
    expect(await screen.findByText("Not deployed to CI yet")).toBeInTheDocument();
    expect(screen.queryByText("Add repository")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Run Security Reviewer automatically on pull requests")).toBeInTheDocument();
    expect(within(dialog).getByText("Target")).toBeInTheDocument();
  });

  it("opens the wizard from Update CI config and + Add repository", async () => {
    installations = [inst("i1", "acme/payments-api", [])];
    renderUi(<CiTab agent={AGENT} />);
    await screen.findByText("acme/payments-api");
    for (const name of ["Update CI config", "Add repository"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(within(await screen.findByRole("dialog")).getByText("Target")).toBeInTheDocument();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});
