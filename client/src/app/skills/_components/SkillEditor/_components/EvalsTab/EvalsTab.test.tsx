import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { evalMessages } from "@/components/eval/test-kit";
import { evalCase, result, suiteRun } from "@/components/eval/fixtures";
import { defaultHostAgent } from "./helpers";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));

import { SkillEditor } from "../../SkillEditor";
import { SkillTrendTooltip } from "./SkillTrendTooltip";

const SKILL = { id: "skill-1", name: "pr-quality-rubric", body: "# Rule", version: 5 } as Skill;
const agent = (id: string, name: string, enabled = true) => ({ id, name, enabled, provider: "openai", model: "m" });
const json = (b: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }));

interface St {
  agents: ReturnType<typeof agent>[];
  cases: ReturnType<typeof evalCase>[];
  runs: ReturnType<typeof suiteRun>[];
  calls: string[];
  bodies: Record<string, unknown>;
}
let st: St;

function stub() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      const method = init?.method ?? "GET";
      st.calls.push(`${method} ${u.pathname}`);
      if (init?.body) st.bodies[`${method} ${u.pathname}`] = JSON.parse(String(init.body));
      if (u.pathname === "/agents") return json(st.agents);
      if (u.pathname === "/skills/skill-1/stats") return json({ used_by: 1, agents: [{ id: "a2", name: "Beta" }], findings_by_category: [] });
      if (u.pathname === "/skills/skill-1/eval-cases") return json(st.cases);
      if (u.pathname === "/skills/skill-1/eval-runs" && method === "POST")
        return json({ eval_run: suiteRun({ n: 9, status: "running", metrics: null }) }, 202);
      if (u.pathname === "/skills/skill-1/eval-runs") return json(st.runs);
      if (u.pathname.startsWith("/eval-runs/"))
        return json({ eval_run: suiteRun({ n: 9, status: "running", cases_done: 1, metrics: null }), results: [] });
      return json({ error: { code: "x", message: "unexpected " + u.pathname } }, 404);
    }),
  );
}

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills, eval: evalMessages, common }}>
        <SkillEditor skill={SKILL} tab="evals" onTab={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  query = "";
  st = {
    agents: [agent("a1", "Alpha"), agent("a2", "Beta"), agent("a3", "Gamma", false)],
    cases: [
      evalCase("c1", "stripe-key-leak", result({ pass: true })),
      evalCase("c2", "ssrf-webhook", result({ pass: true })),
      evalCase("c3", "missing-retry-after", result({ pass: false })),
      evalCase("c4", "clean-refactor-no-flags", result({ pass: true })),
      evalCase("c5", "service-role-in-client", null),
    ],
    runs: [],
    calls: [],
    bodies: {},
  };
  stub();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Skill EvalsTab", () => {
  it("lists the skill's cases instead of the coming-soon stub, with the editor subtitle (AC-72, AC-73)", async () => {
    renderEditor();
    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Run eval case / })).toHaveLength(5);
    expect(screen.getByText("3 / 5 passing")).toBeInTheDocument();
    expect(screen.queryByText("Evals coming soon")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("pr-quality-rubric · simulate a PR and assert the expected output")).toBeInTheDocument();
  });

  it("preselects the first enabled linked agent and starts the header run with it (AC-78, AC-79)", async () => {
    renderEditor();
    const select = await screen.findByLabelText("Host agent");
    await waitFor(() => expect(select).toHaveValue("a2"));
    expect(within(select).queryByRole("option", { name: "Gamma" })).toBeNull();

    fireEvent.change(select, { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run on evals" }));
    await waitFor(() => expect(st.bodies["POST /skills/skill-1/eval-runs"]).toEqual({ host_agent_id: "a1" }));
  });

  it("disables Run on evals with a hint when no agent is enabled (EC-30)", async () => {
    st.agents = [agent("a3", "Gamma", false)];
    renderEditor();
    expect(await screen.findByRole("note")).toHaveTextContent("Link this skill to an agent to run evals");
    expect(screen.getByRole("button", { name: "Run on evals" })).toBeDisabled();
  });
});

describe("Skill EvalsTab — header, history, deep link", () => {
  it("renders Run on evals in the page header row next to the title, not the tab strip (AC-79)", async () => {
    renderEditor();
    const title = await screen.findByRole("heading", { name: "pr-quality-rubric" });
    const button = screen.getByRole("button", { name: "Run on evals" });
    expect(title.parentElement).toContainElement(button);
  });

  it("history row shows the skill version and host agent as 'v5 · <host>' (AC-83)", async () => {
    st.runs = [suiteRun({ n: 5, owner_kind: "skill", owner_id: "skill-1", host_agent_name: "Security Reviewer" })];
    renderEditor();
    const row = (await screen.findByRole("checkbox", { name: /^Select run v5/ })).closest("tr")!;
    expect(row).toHaveTextContent("v5 · Security Reviewer");
  });

  it("trend tooltip shows the skill version and the host agent (AC-83)", () => {
    const point = {
      run_id: "r5",
      agent_version: 5,
      ran_at: "2026-05-05T09:14:00Z",
      recall: 0.8,
      precision: 0.9,
      citation_accuracy: 0.95,
      pass_rate: 1,
      cost_usd: 0.23,
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ skills, eval: evalMessages, common }}>
        <SkillTrendTooltip point={point} hostName="Security Reviewer" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/v5/)).toBeInTheDocument();
    expect(screen.getByText("Host: Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("$0.23")).toBeInTheDocument();
  });

  it("opens the case named by ?case= once loaded, and stays closed after dismissing it", async () => {
    query = "tab=evals&case=c3";
    renderEditor();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("pr-quality-rubric · simulate a PR and assert the expected output")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("missing-retry-after")).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not open an editor for an unknown ?case= id", async () => {
    query = "tab=evals&case=nope";
    renderEditor();
    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("defaultHostAgent (spec Q13)", () => {
  const agents = [agent("a1", "Alpha"), agent("a2", "Beta"), agent("a3", "Gamma", false)] as never[];
  const run = (id: string | null, at: string) => ({ agent_id: id, started_at: at });
  it("prefers the last host, then linked, then first enabled; skips disabled/removed hosts", () => {
    const base = { agents, linkedAgentIds: ["a2"] };
    expect(defaultHostAgent({ ...base, runs: [run("a1", "2026-05-02"), run("a2", "2026-05-01")] })?.id).toBe("a1");
    expect(defaultHostAgent({ ...base, runs: [run("a3", "2026-05-02")] })?.id).toBe("a2");
    expect(defaultHostAgent({ ...base, runs: [run("gone", "2026-05-02")] })?.id).toBe("a2");
    expect(defaultHostAgent({ agents, linkedAgentIds: [], runs: [] })?.id).toBe("a1");
    expect(defaultHostAgent({ agents: [], linkedAgentIds: [], runs: [] })).toBeNull();
  });
});
