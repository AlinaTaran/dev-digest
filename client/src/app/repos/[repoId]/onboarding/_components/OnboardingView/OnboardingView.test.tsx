import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Onboarding, OnboardingTourResponse, OnboardingGeneration } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";

let repoNotFound = false;
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb: { label: string }[] }) => (
    <div>
      <nav aria-label="breadcrumb">{crumb.map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>no repo</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => repoNotFound,
}));

import { OnboardingView } from "./OnboardingView";

const REPO = "11111111-1111-4111-8111-111111111111";
const SHA = "abc1234def5678";

const gen = (status: OnboardingGeneration["status"], over: Partial<OnboardingGeneration> = {}): OnboardingGeneration => ({
  id: "g1",
  status,
  started_at: new Date().toISOString(),
  finished_at: null,
  error_reason: null,
  ...over,
});

function tourDoc(over: Partial<Onboarding> = {}): Onboarding {
  return {
    generated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    source_sha: SHA,
    files_indexed: 12450,
    index_status: "full",
    degraded: false,
    reasons: [],
    model: { provider: "openai", model: "gpt" },
    dropped_refs: 0,
    sections: [
      { kind: "architecture", empty_reason: null, summary_md: "Summary text", top_dirs: [], diagram: null },
      { kind: "critical_paths", empty_reason: null, items: [{ path: "src/server.ts", why: "Bootstrap", fan_in: 3 }] },
      { kind: "run_locally", empty_reason: null, steps: [{ command: "pnpm install", source_path: "package.json", note: null }] },
      { kind: "reading_path", empty_reason: null, steps: [{ path: "src/server.ts", why: "Start here" }] },
      { kind: "first_tasks", empty_reason: "no_data", tasks: [] },
    ],
    ...over,
  } as Onboarding;
}

function resp(over: Partial<OnboardingTourResponse> = {}): OnboardingTourResponse {
  return {
    repo_id: REPO,
    tour: null,
    generation: null,
    availability: { can_generate: true, reason: null },
    stale: false,
    current_index_sha: null,
    ...over,
  };
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

let current: OnboardingTourResponse;
let posts: string[];
let observerCb: ((e: Partial<IntersectionObserverEntry>[]) => void) | null;
let scrolled: string[];
let indexUpdatedAt: string;

beforeEach(() => {
  repoNotFound = false;
  current = resp();
  posts = [];
  scrolled = [];
  indexUpdatedAt = "2026-01-01T00:00:00Z";
  observerCb = null;
  window.location.hash = "";
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
        observerCb = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (init?.method === "POST") {
        posts.push(u.pathname);
        if (u.pathname.endsWith("/onboarding/generate")) {
          current = { ...current, generation: gen("generating") };
          return json({ generation: current.generation });
        }
        if (u.pathname.endsWith("/resync")) {
          // The resync lands later: index state advances and the repo becomes generatable.
          setTimeout(() => {
            indexUpdatedAt = "2026-01-01T00:00:01Z";
            current = resp({ availability: { can_generate: true, reason: null } });
          }, 0);
        }
        return json({ status: "ok" });
      }
      if (u.pathname.endsWith("/onboarding")) return json(current);
      if (u.pathname.endsWith("/index-state")) return json({ updatedAt: indexUpdatedAt });
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <ToastProvider>
        <QueryClientProvider client={qc}>
          <OnboardingView repoId={REPO} />
        </QueryClientProvider>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const stubClipboard = (writeText: (s: string) => Promise<void>) =>
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

describe("OnboardingView — no tour", () => {
  it("shows one generate button, starts generation and shows progress with elapsed counter", async () => {
    renderView();
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("acme/payments-api > Onboarding Tour");
    const btn = await screen.findByRole("button", { name: "Generate onboarding tour" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /regenerate|share/i })).not.toBeInTheDocument();

    fireEvent.click(btn);
    const busy = await screen.findByRole("button", { name: "Generating…" });
    expect(busy).toBeDisabled();
    expect(posts).toContain(`/repos/${REPO}/onboarding/generate`);
    expect(screen.getByText(/s elapsed/)).toBeInTheDocument();
  });

  it("explains a failed last generation above an enabled button", async () => {
    current = resp({ generation: gen("failed", { error_reason: "timeout" }) });
    renderView();
    expect(await screen.findByText("Last generation failed: the generation timed out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeEnabled();
  });

  it("not_cloned disables the button; no_index offers Resync", async () => {
    current = resp({ availability: { can_generate: false, reason: "not_cloned" } });
    renderView();
    expect(await screen.findByText("repo is not cloned yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeDisabled();
    expect(screen.queryByText(/Takes 30–60s/)).not.toBeInTheDocument();
    cleanup();

    current = resp({ availability: { can_generate: false, reason: "no_index" } });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Resync" }));
    await waitFor(() => expect(posts).toContain(`/repos/${REPO}/resync`));
    expect(screen.queryByText(/Takes 30–60s/)).not.toBeInTheDocument();
  });

  it("Resync disables while pending, posts once, then refreshes the tour out of no_index", async () => {
    current = resp({ availability: { can_generate: false, reason: "no_index" } });
    renderView();
    const btn = await screen.findByRole("button", { name: "Resync" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(await screen.findByRole("button", { name: "Generate onboarding tour" }, { timeout: 5000 })).toBeEnabled();
    expect(posts.filter((p) => p.endsWith("/resync"))).toHaveLength(1);
  });

  it("renders RepoNotFound for an unknown repo", async () => {
    repoNotFound = true;
    renderView();
    expect(await screen.findByText("no repo")).toBeInTheDocument();
  });
});

describe("OnboardingView — tour", () => {
  it("renders heading, subtitle, buttons and all five sections", async () => {
    current = resp({ tour: tourDoc(), generation: gen("done") });
    renderView();
    expect(await screen.findByRole("heading", { level: 1, name: "Onboarding for payments-api" })).toBeInTheDocument();
    expect(screen.getByText("Generated from index of 12,450 files · last refreshed 2h ago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Share link" })).toBeInTheDocument();
    expect(screen.getByText("Summary text")).toBeInTheDocument();
    expect(screen.queryByText(/Last regeneration failed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/repo index is now at/)).not.toBeInTheDocument();
  });

  it("keeps sections while regenerating, then swaps in the new tour when done", async () => {
    current = resp({ tour: tourDoc(), generation: gen("generating") });
    renderView();
    expect(await screen.findByRole("button", { name: "Regenerating…" })).toBeDisabled();
    expect(screen.getByText("Summary text")).toBeInTheDocument();
    cleanup();

    current = resp({ tour: tourDoc(), generation: gen("done") });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByRole("button", { name: "Regenerating…" })).toBeDisabled();
  });

  it("shows stale, degraded, partial and failed-regeneration banners", async () => {
    current = resp({
      tour: tourDoc({
        reasons: ["llm_unavailable", "no_import_graph"],
        degraded: true,
        index_status: "partial",
        files_indexed: 900,
      }),
      stale: true,
      current_index_sha: "fff9999aaa",
      generation: gen("failed", { error_reason: "llm_failed" }),
    });
    renderView();
    expect(await screen.findByText(`This tour was generated from abc1234; the repo index is now at fff9999`)).toBeInTheDocument();
    expect(screen.getByText(/No API key is configured for the Onboarding Tour model — this tour/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByText(/No import graph is available/)).toBeInTheDocument();
    expect(screen.getByText("Based on a partial index (900 files)")).toBeInTheDocument();
    expect(screen.getByText("Last regeneration failed: the model call failed")).toBeInTheDocument();
  });

  it("disables Regenerate with a visible reason when the repo is not cloned", async () => {
    current = resp({ tour: tourDoc(), generation: gen("done"), availability: { can_generate: false, reason: "not_cloned" } });
    renderView();
    expect(await screen.findByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText("repo is not cloned yet")).toBeInTheDocument();
    expect(screen.getByText("Summary text")).toBeInTheDocument();
  });

  it("TOC lists five items, jumps + sets the hash, tracks the active section; headers collapse", async () => {
    current = resp({ tour: tourDoc(), generation: gen("done") });
    renderView();
    const toc = await screen.findByRole("navigation", { name: "On this page" });
    const links = within(toc).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "location");

    const header = screen.getByRole("button", { name: /First tasks/ });
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(toc).getByRole("link", { name: "First tasks" }));
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(window.location.hash).toBe("#first-tasks");
    expect(scrolled).toContain("first-tasks");
    expect(within(toc).getByRole("link", { name: "First tasks" })).toHaveAttribute("aria-current", "location");

    act(() => {
      observerCb?.([{ isIntersecting: true, target: document.getElementById("critical-paths")! }]);
      observerCb?.([{ isIntersecting: false, target: document.getElementById("first-tasks")! }]);
    });
    expect(within(toc).getByRole("link", { name: "Critical paths" })).toHaveAttribute("aria-current", "location");
  });

  it("honours a known initial hash and ignores unknown ones", async () => {
    window.location.hash = "#critical-paths";
    current = resp({ tour: tourDoc(), generation: gen("done") });
    renderView();
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(scrolled).toContain("critical-paths"));
    cleanup();

    scrolled = [];
    window.location.hash = "#evil";
    renderView();
    await screen.findByRole("heading", { level: 1 });
    expect(scrolled).toEqual([]);
  });

  it("share copies the deep link and toasts; a rejected clipboard shows a read-only field", async () => {
    current = resp({ tour: tourDoc(), generation: gen("done") });
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
    const url = `${window.location.origin}/repos/${REPO}/onboarding#architecture`;
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
    cleanup();

    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
    const field = await screen.findByRole("textbox", { name: "Tour link" });
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveValue(url);
    expect(screen.getByText(/Couldn’t copy automatically/)).toBeInTheDocument();
  });
});
