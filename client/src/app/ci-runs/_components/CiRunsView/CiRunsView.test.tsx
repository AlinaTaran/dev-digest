import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ci from "../../../../../messages/en/ci.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

const json = (b: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }));

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  ci_installation_id: "i1",
  repo: "acme/payments-api",
  agent_id: "a1",
  pr_number: 482,
  ran_at: "2026-11-18T10:00:00Z",
  status: "succeeded",
  verdict: "request_changes",
  findings_count: 3,
  critical: 1,
  warning: 1,
  suggestion: 1,
  run_attempt: 1,
  cost_usd: 0.0123,
  github_url: "https://github.com/acme/payments-api/actions/runs/99",
  source: "ci",
  agent: "Security Reviewer",
  duration_s: 75,
  ...over,
});

let items: ReturnType<typeof row>[];
let refreshResponse: () => Promise<Response>;
let calls: string[];

beforeEach(() => {
  items = [];
  calls = [];
  refreshResponse = () => json({ ingested: 0, errors: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      calls.push(`${init?.method ?? "GET"} ${u.pathname}`);
      if (u.pathname === "/ci/runs" && !init?.method) return json({ items });
      if (u.pathname === "/ci/runs/refresh") return refreshResponse();
      return json({ error: { code: "x", message: "unexpected " + u.pathname } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci }}>
        <CiRunsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CiRunsView", () => {
  it("renders every column of a run, '—' for an unknown cost, and only GitHub links", async () => {
    items = [row(), row({ id: "r2", pr_number: 7, cost_usd: null, github_url: "javascript:alert(1)", status: "skipped", verdict: null })];
    renderView();
    expect(screen.getByRole("heading", { name: "CI Runs" })).toBeInTheDocument();
    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(rows).toHaveLength(2);

    const first = within(rows[0]!);
    expect(first.getByText("acme/payments-api")).toBeInTheDocument();
    expect(first.getByRole("link", { name: "#482" })).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/482");
    expect(first.getByText("Security Reviewer")).toBeInTheDocument();
    expect(first.getByText("Request changes")).toBeInTheDocument();
    expect(first.getByText("3")).toBeInTheDocument();
    expect(first.getByText("$0.012")).toBeInTheDocument();
    expect(first.getByText("1m 15s")).toBeInTheDocument();
    expect(first.getByText("Succeeded")).toBeInTheDocument();
    expect(first.getByRole("link", { name: "View job" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/actions/runs/99",
    );

    const second = within(rows[1]!);
    expect(second.getByText("—", { selector: "td:nth-child(6)" })).toBeInTheDocument();
    expect(second.queryByRole("link", { name: "View job" })).toBeNull();
  });

  it("shows the empty state when there are no CI runs", async () => {
    renderView();
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("Refresh lists per-repo errors, refetches the runs and ignores a double click", async () => {
    refreshResponse = () =>
      json({ ingested: 2, errors: [{ repo: "acme/web", reason: "Resource not accessible by PAT" }] });
    renderView();
    await screen.findByText("No CI runs yet");

    items = [row()];
    const button = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByText("acme/web: Resource not accessible by PAT")).toBeInTheDocument();
    expect(screen.getByText("Ingested 2 new runs.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(calls.filter((c) => c === "POST /ci/runs/refresh")).toHaveLength(1);
  });
});
