import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { freshState, renderWithProviders, stubContextApi, type ApiState } from "@/components/project-context-attach/test-kit";

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));

import { ContextTab } from "./ContextTab";

let st: ApiState;
let release: () => void;

function renderTab() {
  return renderWithProviders(<ContextTab skill={{ id: "sk1", name: "S" } as Skill} />).errors;
}

beforeEach(() => {
  st = freshState();
  release = stubContextApi(st);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Skill ContextTab", () => {
  it("renders heading, hint, Serializes as, caption, compact preview; toggle PUTs the skill list and the serialized block follows", async () => {
    const errors = renderTab();
    expect(await screen.findByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(await screen.findByTestId("context-serialized")).toHaveTextContent(/^## Project context\s*- docs\/a\.md$/);
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(screen.getByText(/Injected as an untrusted block/)).toBeInTheDocument();
    expect(screen.queryByText("Inherited from skills")).toBeNull();
    // compact counter = "N attached" (design), not "N of M attached"
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    // compact preview = icon-only button (no visible "Preview" label)
    expect(screen.getByRole("button", { name: "Preview docs/a.md" })).toHaveTextContent("");

    fireEvent.click(screen.getByRole("checkbox", { name: "docs/b.md" }));
    await waitFor(() =>
      expect(st.putBodies.at(-1)).toEqual({ path: "/skills/sk1/context", body: { repo_id: "r1", paths: ["docs/a.md", "docs/b.md"] } }),
    );
    await waitFor(() => expect(screen.getByTestId("context-serialized").textContent).toContain("- docs/b.md"));
    expect(errors).toEqual([]);
  });

  it("disables controls while pending and shows an alert when the PUT fails", async () => {
    st.holdPut = true;
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/b.md" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeDisabled());
    expect(screen.getByRole("checkbox", { name: "docs/b.md" })).toBeDisabled();
    st.putStatus = 500;
    release();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save project context");
  });
});
