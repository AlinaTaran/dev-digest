import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextListing, ContextDocDetail } from "@devdigest/shared";
import contextMessages from "../../../../../../../messages/en/context.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>no repo</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));

import { ProjectContextView } from "./ProjectContextView";

const REPO = "11111111-1111-4111-8111-111111111111";

function listing(over: Partial<ContextListing> = {}): ContextListing {
  return {
    repo_id: REPO,
    globs: ["**/{specs,docs,insights}/**/*.md"],
    scanned_at: new Date().toISOString(),
    clone_sha: "abc1234",
    degraded: false,
    reason: null,
    truncated: false,
    total_found: 2,
    docs: [
      { path: "specs/architecture.md", name: "architecture.md", dir: "specs", type: "specs", size_bytes: 400, tokens: 100, too_large: false, used_by_agents: 2 },
      { path: "docs/guide.md", name: "guide.md", dir: "docs", type: "docs", size_bytes: 80, tokens: 20, too_large: false, used_by_agents: 0 },
    ],
    ...over,
  };
}

let contents: Record<string, string>;
let putStatus: number | null;
let putBodies: unknown[];
let current: ContextListing;

function detail(path: string): ContextDocDetail {
  const content = contents[path]!;
  return {
    path,
    content,
    content_hash: `h-${content.length}`,
    tokens: Math.ceil(content.length / 4),
    size_bytes: content.length,
    type: path.startsWith("specs") ? "specs" : "docs",
    used_by_agents: [
      { agent_id: "a1", agent_name: "A", via: "agent" },
      { agent_id: "a1", agent_name: "A", via: "skill", skill_name: "S" },
      { agent_id: "a2", agent_name: "B", via: "agent" },
    ],
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  allErrors = [];
  contents = { "specs/architecture.md": "## Goals\n\nShip it.", "docs/guide.md": "# Guide\n\nHello." };
  putStatus = null;
  putBodies = [];
  current = listing();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/context/doc") && init?.method === "PUT") {
        const body = JSON.parse(init.body as string);
        putBodies.push(body);
        if (putStatus) return json({ error: { code: "doc_changed_on_disk", message: "changed" } }, putStatus);
        contents[body.path] = body.content;
        const d = detail(body.path);
        return json({ path: body.path, content_hash: d.content_hash, tokens: d.tokens, size_bytes: d.size_bytes, saved_at: "now" });
      }
      if (u.pathname.endsWith("/context/reindex")) return json(current);
      if (u.pathname.endsWith("/context/doc")) return json(detail(u.searchParams.get("path")!));
      if (u.pathname.endsWith("/context")) return json(current);
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  // NFR-9: no next-intl MISSING_MESSAGE / format errors in any rendered state
  for (const errs of allErrors) expect(errs).toEqual([]);
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let allErrors: unknown[] = [];

function renderView() {
  const errors: unknown[] = [];
  allErrors.push(errors);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }} onError={(e) => errors.push(e)}>
        <ProjectContextView repoId={REPO} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { errors };
}

describe("ProjectContextView", () => {
  it("lists docs with type badge + tokens, previews markdown, shows used-by, and only offers Refresh", async () => {
    const { errors } = renderView();
    const list = await screen.findByRole("list", { name: "Documents" });
    const row = within(list).getByRole("button", { name: /architecture\.md/ });
    expect(within(row).getByText("specs")).toBeInTheDocument();
    expect(within(row).getByText("≈ 100 tokens")).toBeInTheDocument();
    expect(screen.getByText(/2 files · scanned just now/)).toBeInTheDocument();
    expect(screen.queryByText(/chunks/i)).toBeNull();
    // AC-9: globs line under the title shows the active globs
    expect(screen.getByText("Search globs: **/{specs,docs,insights}/**/*.md")).toBeInTheDocument();

    // toolbar: Refresh is the only action (AC-77)
    expect(screen.getAllByRole("button", { name: /refresh/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /re-index|resync|chunks/i })).toBeNull();

    // first doc is auto-selected and previewed, no click needed
    expect(row).toHaveAttribute("aria-current", "true");
    expect(await screen.findByRole("heading", { name: "Goals" })).toBeInTheDocument();
    // distinct agents: a1 (twice) + a2 = 2
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    expect(screen.queryByText(/Saving writes directly/)).toBeNull();
    // AC-72: edit-only warning appears in Edit and disappears back in Preview
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/Saving writes directly/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByText(/Saving writes directly/)).toBeNull();
    expect(errors).toEqual([]);
  });

  it("edits raw markdown, saves with base_hash, and refreshes preview + tokens", async () => {
    renderView();
    await screen.findByRole("heading", { name: "Goals" });
    const baseHash = `h-${contents["specs/architecture.md"]!.length}`;

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox", { name: "Edit document content" });
    expect(editor).toHaveValue("## Goals\n\nShip it."); // raw markdown (AC-64)
    expect(screen.getByText(/Saving writes directly/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(editor, { target: { value: "## Goals\n\nShip it.\n\n## Non-goals\n\nNothing else." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toMatchObject({ path: "specs/architecture.md", base_hash: baseHash });
    // back in preview with the new section, and the new token estimate
    expect(await screen.findByRole("heading", { name: "Non-goals" })).toBeInTheDocument();
    expect(screen.queryByText(/Saving writes directly/)).toBeNull();
    await waitFor(() => expect(screen.getAllByText(`≈ ${Math.ceil(contents["specs/architecture.md"]!.length / 4)} tokens`).length).toBeGreaterThan(0));
  });

  it("shows the file-changed message on 409 and keeps the draft", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: /guide\.md/ }));
    await screen.findByRole("heading", { name: "Guide" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    putStatus = 409;
    fireEvent.change(screen.getByRole("textbox", { name: "Edit document content" }), { target: { value: "# Guide\n\nMine." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/File changed on disk/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Edit document content" })).toHaveValue("# Guide\n\nMine.");
  });

  it("asks for confirmation when switching docs with unsaved edits", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: /guide\.md/ }));
    await screen.findByRole("heading", { name: "Guide" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit document content" }), { target: { value: "dirty" } });

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: /architecture\.md/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Edit document content" })).toHaveValue("dirty");

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: /architecture\.md/ }));
    expect(await screen.findByRole("heading", { name: "Goals" })).toBeInTheDocument();
  });

  it("guards in-app link clicks while the draft is dirty (AC-76), not when clean", async () => {
    renderView();
    const link = await screen.findByRole("link", { name: "Edit globs" });
    const stop = (e: Event) => e.preventDefault(); // keep jsdom from "navigating"
    document.addEventListener("click", stop);
    const confirm = vi.spyOn(window, "confirm");

    // clean draft -> no prompt
    await screen.findByRole("heading", { name: "Goals" });
    expect(fireEvent.click(link)).toBe(false); // only our stub prevented it
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit document content" }), { target: { value: "dirty" } });

    // declined -> click cancelled before Next's Link handler, draft kept
    confirm.mockReturnValueOnce(false);
    const seen = vi.fn();
    link.addEventListener("click", seen);
    fireEvent.click(link);
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Discard them?");
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Edit document content" })).toHaveValue("dirty");

    // accepted -> click proceeds
    confirm.mockReturnValueOnce(true);
    fireEvent.click(link);
    expect(seen).toHaveBeenCalledTimes(1);

    // modifier-click opens elsewhere -> no prompt
    confirm.mockClear();
    fireEvent.click(link, { metaKey: true });
    expect(confirm).not.toHaveBeenCalled();
    document.removeEventListener("click", stop);
  });

  it("save then immediately save again sends the NEW base_hash (no stale hash / 409)", async () => {
    renderView();
    await screen.findByRole("heading", { name: "Goals" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit document content" }), { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    // back in preview only after the cache holds the saved content (no flash of old text)
    expect(await screen.findByText("first")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Edit document content" })).toHaveValue("first");
    fireEvent.change(screen.getByRole("textbox", { name: "Edit document content" }), { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBodies).toHaveLength(2));
    expect(putBodies[1]).toMatchObject({ content: "second", base_hash: "h-5" });
  });

  it("auto-selects the first doc, colors type badges, and keeps an explicit selection after refetch", async () => {
    renderView();
    const list = await screen.findByRole("list", { name: "Documents" });
    expect(await screen.findByRole("heading", { name: "Goals" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /architecture\.md/ })).toHaveAttribute("aria-current", "true");
    expect(within(list).getByText("docs")).toHaveStyle({ color: "var(--ok)" });
    expect(within(list).getByText("specs")).toHaveStyle({ color: "var(--accent-text)" });

    fireEvent.click(within(list).getByRole("button", { name: /guide\.md/ }));
    expect(await screen.findByRole("heading", { name: "Guide" })).toBeInTheDocument();

    // reorder + refetch: the explicit pick stays, the new first doc does not steal it
    current = listing({ docs: [...current.docs].reverse() });
    fireEvent.click(screen.getAllByRole("button", { name: /refresh/i })[0]!);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Documents" })).getAllByRole("button")[0]).toHaveTextContent("docs/guide.md"));
    expect(within(screen.getByRole("list", { name: "Documents" })).getByRole("button", { name: /guide\.md/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { name: "Guide" })).toBeInTheDocument();
  });

  it("shows the not-cloned and no-match empty states", async () => {
    current = listing({ degraded: true, reason: "not_cloned", docs: [], total_found: 0 });
    renderView();
    expect(await screen.findByText("Repository isn’t cloned yet")).toBeInTheDocument();
    cleanup();

    current = listing({ docs: [], total_found: 0 });
    renderView();
    expect(await screen.findByText("No matching documents")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change the globs in Settings" })).toHaveAttribute("href", "/settings/project-context");
  });

  it("notes truncation", async () => {
    current = listing({ truncated: true, total_found: 731 });
    renderView();
    expect(await screen.findByText("Showing 2 of 731")).toBeInTheDocument();
  });
});
