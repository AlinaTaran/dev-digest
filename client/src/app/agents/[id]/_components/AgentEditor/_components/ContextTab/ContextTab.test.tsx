import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { Agent } from "@devdigest/shared";
import { doc, freshState, renderWithProviders, stubContextApi, type ApiState } from "@/components/project-context-attach/test-kit";

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId }) }));
let repoId: string | null = "r1";

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", name: "A" } as Agent;
let st: ApiState;
let release: () => void;

function renderTab() {
  const { errors } = renderWithProviders(<ContextTab agent={AGENT} />);
  return errors;
}

beforeEach(() => {
  repoId = "r1";
  st = freshState({
    docs: [doc("docs/a.md", 10), doc("docs/b.md", 20), doc("specs/c.md", 30, { type: "specs" })],
    attached: ["docs/a.md"],
    inherited: [{ path: "docs/b.md", skill_id: "s1", skill_name: "Security", missing: false, tokens: 20, duplicate_of_attached: false }],
  });
  release = stubContextApi(st);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Agent ContextTab", () => {
  it("renders heading, hint, counter, tokens, caption, inherited via-skill and type badges without i18n errors", async () => {
    const errors = renderTab();
    expect(await screen.findByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByText(/Order matters — earlier docs appear earlier/)).toBeInTheDocument();
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 10 tokens")).toBeInTheDocument();
    expect(screen.getByText(/Injected as an untrusted block \(## Project context\) into every run\./)).toBeInTheDocument();
    expect(screen.getByText("via Security")).toBeInTheDocument();
    expect(screen.queryByTestId("context-serialized")).toBeNull();
    // attached first, then available, in one list
    const rows = screen.getAllByTestId(/^context-row-/).map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual(["context-row-docs/a.md", "context-row-docs/b.md", "context-row-specs/c.md"]);
    expect(within(screen.getByTestId("context-row-specs/c.md")).getByText("specs")).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it("toggle PUTs the appended path, then reorder PUTs the new order and the counter/footer follow", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/b.md" }));
    await waitFor(() =>
      expect(st.putBodies.at(-1)).toEqual({ path: "/agents/ag1/context", body: { repo_id: "r1", paths: ["docs/a.md", "docs/b.md"] } }),
    );
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(await screen.findByText("≈ 30 tokens")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move docs/b.md up" }));
    await waitFor(() => expect(st.putBodies.at(-1)!.body.paths).toEqual(["docs/b.md", "docs/a.md"]));

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "SPECS" } });
    expect(screen.getByRole("checkbox", { name: "specs/c.md" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "docs/a.md" })).toBeNull();
  });

  it("opens the preview as a right-hand drawer with details + body; Esc closes and focus returns to the Preview button", async () => {
    renderTab();
    const opener = await screen.findByRole("button", { name: "Preview docs/a.md" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("a.md");
    expect(within(dialog).getByText("docs/a.md")).toBeInTheDocument();
    expect(await within(dialog).findByText("Hello doc")).toBeInTheDocument();
    expect(within(dialog).getByText("≈ 10 tokens")).toBeInTheDocument();
    expect(within(dialog).getByText("Used by 2 agents")).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("shows empty states without a repo and for a not-cloned repo", async () => {
    repoId = null;
    renderTab();
    expect(screen.getByText("No repository selected")).toBeInTheDocument();
    cleanup();
    repoId = "r1";
    st.degraded = true;
    renderTab();
    expect(await screen.findByText("Repository not cloned")).toBeInTheDocument();
  });

  it("disables the controls while the PUT is pending", async () => {
    st.holdPut = true;
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/b.md" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeDisabled());
    expect(screen.getByRole("checkbox", { name: "docs/b.md" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move docs/a.md down" })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeEnabled());
  });

  it("shows an alert when the PUT fails", async () => {
    st.putStatus = 500;
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/b.md" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save project context");
  });
});
