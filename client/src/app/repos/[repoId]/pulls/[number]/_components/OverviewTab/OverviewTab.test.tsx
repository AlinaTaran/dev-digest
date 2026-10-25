import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import brief from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual<object>("@/lib/api")), api: { get, post } }));
// Not under test here: the blast panel pulls in the repo-intel hooks and a graph renderer.
vi.mock("../BlastRadiusPanel/BlastRadiusPanel", () => ({
  BlastRadiusPanel: () => (
    <section aria-label="Blast radius card">
      <h3>Blast radius</h3>
    </section>
  ),
}));

import { OverviewTab } from "./OverviewTab";

const FULL: PrBriefResponse = {
  pr_id: "11111111-1111-4111-8111-111111111111",
  generating: false,
  stale: false,
  current_head_sha: "abcdef1234567",
  brief: {
    summary: "Adds a config loader.",
    risks: {
      risks: [
        {
          kind: "security",
          title: "Unvalidated config",
          explanation: "Env values flow in unchecked.",
          severity: "high",
          file_refs: ["src/config.ts:12"],
        },
      ],
    },
    review_focus: [{ file: "src/config.ts", line: 12, reason: "parses env", line_adjusted: false }],
    intent: null,
    blast: null,
    history: null,
    meta: {
      head_sha: "abcdef1234567",
      generated_at: "2026-10-25T00:00:00Z",
      model: { provider: "openai", model: "x" },
      missing_inputs: [],
      blast_reason: null,
      input_truncated: [],
      input_tokens_est: 1,
      specs_used: [],
      specs_skipped: [],
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: null,
      dropped_refs: 0,
      adjusted_lines: 0,
    },
  },
};
const EMPTY: PrBriefResponse = { ...FULL, brief: null };
const INTENT = {
  intent: "Load config",
  in_scope: ["a"],
  out_of_scope: ["b"],
  risks: [{ kind: "x", title: "Legacy chip title", explanation: "e", severity: "high", file_refs: [] }],
};

let briefResponse: PrBriefResponse;
const navigate = vi.fn();

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  navigate.mockReset();
  briefResponse = EMPTY;
  get.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith("/brief") ? briefResponse : url.endsWith("/intent") ? INTENT : null),
  );
});
afterEach(cleanup);

function renderTab(review: ReviewRecord | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ brief, prReview, shell }}
        onError={(e) => {
          throw e;
        }}
      >
        <OverviewTab
          prId="p1"
          prBody="The description"
          repoId="r1"
          repoFullName="o/r"
          headSha="abcdef1234567"
          blastView="tree"
          onBlastViewChange={() => {}}
          latestVerdictReview={review}
          onNavigateToDiff={navigate}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("OverviewTab PR Brief", () => {
  it("shows the empty state first without auto-generating, and keeps the other cards (AC-1, AC-2, AC-4, AC-37)", async () => {
    renderTab();
    const generate = await screen.findByRole("button", { name: "Generate brief" });
    expect(screen.getAllByRole("button", { name: "Generate brief" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Regenerate brief" })).toBeNull();
    expect(screen.queryByText("Risk areas")).toBeNull();
    expect(post).not.toHaveBeenCalled();

    // DOM order: PR Brief heading, then Intent card, then Blast radius card.
    const heading = screen.getByText("PR Brief");
    await screen.findByText("Load config");
    const intent = screen.getByText("Load config");
    const blast = screen.getByText("Blast radius");
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(heading, generate)).toBe(true);
    expect(follows(heading, intent)).toBe(true);
    expect(follows(intent, blast)).toBe(true);
    expect(screen.getByText("The description")).toBeInTheDocument();
    // AC-37: the intent's own risk list is no longer rendered as chips.
    expect(screen.queryByText("Legacy chip title")).toBeNull();
  });

  it("generates, renders summary + risks inside the Intent card + full-width focus, and navigates on click (AC-5, AC-31, AC-38, AC-41)", async () => {
    let resolvePost: (v: PrBriefResponse) => void = () => {};
    post.mockReturnValue(new Promise<PrBriefResponse>((r) => (resolvePost = r)));
    renderTab();
    const generate = await screen.findByRole("button", { name: "Generate brief" });
    fireEvent.click(generate);
    fireEvent.click(generate);
    expect(await screen.findByRole("button", { name: /Generating/ })).toBeDisabled();
    expect(post).toHaveBeenCalledTimes(1);

    briefResponse = FULL;
    resolvePost(FULL);
    expect(await screen.findByText("Adds a config loader.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();

    const intentCard = screen.getByText("Load config").closest("div[style]")!.parentElement!;
    expect(within(intentCard).getByText("Risk areas")).toBeInTheDocument();
    expect(within(intentCard).getByRole("group", { name: /Unvalidated config/ })).toBeInTheDocument();
    const focus = screen.getByRole("button", { name: /Open src\/config.ts at line 12/ });
    expect(within(intentCard).queryByText("Review focus — read these first")).toBeNull();

    fireEvent.click(focus);
    expect(navigate).toHaveBeenCalledWith("src/config.ts", 12);
  });

  it("keeps the old brief while regenerating and shows the error next to it (AC-6, AC-13, AC-15)", async () => {
    briefResponse = FULL;
    let rejectPost: (e: unknown) => void = () => {};
    post.mockReturnValue(new Promise((_, rej) => (rejectPost = rej)));
    renderTab();
    const regenerate = await screen.findByRole("button", { name: "Regenerate brief" });
    fireEvent.click(regenerate);
    await waitFor(() => expect(regenerate).toBeDisabled());
    expect(regenerate).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Adds a config loader.")).toBeInTheDocument();

    const { ApiError } = await import("@/lib/api");
    rejectPost(new ApiError("bad", 502, "x", { reason: "llm_failed" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("the model call failed");
    expect(screen.getByText("Adds a config loader.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeEnabled();
  });

  it("shows the stale banner (S11) and never names a button like a tab", async () => {
    briefResponse = { ...FULL, stale: true, current_head_sha: "ffffff0000000" };
    post.mockRejectedValue(new Error("x"));
    renderTab();
    expect(await screen.findByText(/generated for abcdef1/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Regenerate brief" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Regenerate brief" })[0]!);
    await screen.findByRole("alert");
    // e2e flows click the tab buttons by substring name.
    expect(screen.queryAllByRole("button", { name: /Files changed/ })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Agent runs/ })).toHaveLength(0);
  });

  it("renders the latest verdict above the summary (AC-29)", async () => {
    briefResponse = FULL;
    const review = {
      verdict: "request_changes",
      score: 40,
      findings: [{ severity: "CRITICAL", dismissed_at: null }],
    } as unknown as ReviewRecord;
    renderTab(review);
    expect(await screen.findByText("Adds a config loader.")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
  });
});
