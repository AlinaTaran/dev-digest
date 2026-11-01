import React from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  AgentContextResponse,
  ContextAttachedItem,
  ContextDoc,
  ContextDocDetail,
  ContextInheritedItem,
  ContextListing,
  SkillContextResponse,
} from "@devdigest/shared";
import contextMessages from "../../../messages/en/context.json";
import agentsMessages from "../../../messages/en/agents.json";
import skillsMessages from "../../../messages/en/skills.json";

export const REPO_ID = "r1";

export function doc(path: string, tokens: number, over: Partial<ContextDoc> = {}): ContextDoc {
  const i = path.lastIndexOf("/");
  return {
    path,
    name: path.slice(i + 1),
    dir: path.slice(0, i),
    type: "docs",
    size_bytes: tokens * 4,
    tokens,
    too_large: false,
    used_by_agents: 0,
    ...over,
  };
}

export interface ApiState {
  docs: ContextDoc[];
  attached: string[];
  inherited: ContextInheritedItem[];
  degraded: boolean;
  /** When set, the PUT answers with this status instead of saving. */
  putStatus: number | null;
  /** Hold the PUT open until `releasePut()` — to observe the pending state. */
  holdPut: boolean;
  putBodies: Array<{ path: string; body: { repo_id: string; paths: string[] } }>;
}

export function freshState(over: Partial<ApiState> = {}): ApiState {
  return {
    docs: [doc("docs/a.md", 10), doc("docs/b.md", 20), doc("specs/c.md", 30, { type: "specs" })],
    attached: ["docs/a.md"],
    inherited: [],
    degraded: false,
    putStatus: null,
    holdPut: false,
    putBodies: [],
    ...over,
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function listing(st: ApiState): ContextListing {
  return {
    repo_id: REPO_ID,
    globs: ["**/*.md"],
    scanned_at: new Date().toISOString(),
    clone_sha: "abc1234",
    degraded: st.degraded,
    reason: st.degraded ? "not_cloned" : null,
    truncated: false,
    total_found: st.docs.length,
    docs: st.degraded ? [] : st.docs,
  };
}

function attachedItems(st: ApiState): ContextAttachedItem[] {
  return st.attached.map((path, position) => {
    const d = st.docs.find((x) => x.path === path);
    return { path, position, missing: !d, tokens: d?.tokens ?? null };
  });
}

function total(st: ApiState): number {
  return attachedItems(st).reduce((n, a) => n + (a.tokens ?? 0), 0);
}

function agentCtx(st: ApiState): AgentContextResponse {
  return { repo_id: REPO_ID, attached: attachedItems(st), inherited: st.inherited, effective: [], total_tokens: total(st) };
}

function skillCtx(st: ApiState): SkillContextResponse {
  return {
    repo_id: REPO_ID,
    attached: attachedItems(st),
    total_tokens: total(st),
    serialized: ["## Project context", ...st.attached.map((p) => `- ${p}`)].join("\n"),
  };
}

function docDetail(st: ApiState, path: string): ContextDocDetail {
  const d = st.docs.find((x) => x.path === path)!;
  return {
    path,
    content: "# Hello doc\n\nBody text.",
    content_hash: "h1",
    tokens: d.tokens,
    size_bytes: d.size_bytes,
    type: d.type,
    used_by_agents: [
      { agent_id: "a1", agent_name: "A", via: "agent" },
      { agent_id: "a1", agent_name: "A", via: "skill", skill_name: "S" },
      { agent_id: "a2", agent_name: "B", via: "agent" },
    ],
  };
}

/** Stateful stub of the context endpoints, routed by `URL.pathname`. Returns a function releasing a held PUT. */
export function stubContextApi(st: ApiState): () => void {
  let release: () => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const owner = u.pathname.match(/^\/(agents|skills)\/[^/]+\/context$/);
      if (owner && init?.method === "PUT") {
        const body = JSON.parse(init.body as string) as { repo_id: string; paths: string[] };
        st.putBodies.push({ path: u.pathname, body });
        if (st.holdPut) await new Promise<void>((r) => (release = r));
        if (st.putStatus) return json({ error: { code: "boom", message: "boom" } }, st.putStatus);
        st.attached = body.paths;
        return json(owner[1] === "agents" ? agentCtx(st) : skillCtx(st));
      }
      if (owner?.[1] === "agents") return json(agentCtx(st));
      if (owner?.[1] === "skills") return json(skillCtx(st));
      if (u.pathname.endsWith("/context/doc")) return json(docDetail(st, u.searchParams.get("path")!));
      if (u.pathname.endsWith("/context")) return json(listing(st));
      return json({}, 404);
    }),
  );
  return () => release();
}

export function renderWithProviders(ui: React.ReactElement) {
  const errors: unknown[] = [];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ context: contextMessages, agents: agentsMessages, skills: skillsMessages }}
        onError={(e) => errors.push(e)}
      >
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { errors };
}
