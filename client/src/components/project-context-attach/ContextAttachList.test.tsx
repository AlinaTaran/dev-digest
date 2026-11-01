import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { ContextDoc, ContextAttachedItem, ContextInheritedItem } from "@devdigest/shared";
import { ContextAttachList } from "./ContextAttachList";
import { arrayMove, contextDocTypeTone, matchesFilter, togglePath } from "./helpers";
import type { ContextAttachLabels } from "./types";

function doc(path: string, tokens: number, over: Partial<ContextDoc> = {}): ContextDoc {
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

const DOCS = [doc("docs/a.md", 10), doc("docs/b.md", 20), doc("specs/c.md", 30, { type: "specs" })];

const LABELS: ContextAttachLabels = {
  filterPlaceholder: "Filter documents…",
  filterAria: "Filter documents",
  counter: "",
  inheritedGroup: "Inherited",
  emptyAttached: "none",
  emptyFiltered: "no match",
  missing: "missing",
  tooLarge: "too large",
  duplicate: "also attached",
  footerTokens: (n) => `≈ ${n} tokens`,
  caption: "Injected as an untrusted block (## Project context) into every run.",
  tokens: (n) => (n == null ? "— tok" : `≈ ${n} tok`),
  viaSkill: (s) => `via ${s}`,
  typeLabel: (t) => t,
  dragHandle: (p) => `Reorder ${p}`,
  moveUp: (p) => `Move ${p} up`,
  moveDown: (p) => `Move ${p} down`,
  remove: (p) => `Remove ${p}`,
  preview: (p) => `Preview ${p}`,
  previewText: "Preview",
};

const INHERITED: ContextInheritedItem[] = [
  { path: "docs/b.md", skill_id: "s1", skill_name: "Security", missing: false, tokens: 20, duplicate_of_attached: false },
];

/** Stateful host emulating the server: PUT replaces the ordered list, tokens re-sum. */
function Host({ initial, onPut, onPreview = vi.fn(), compactPreview }: { initial: string[]; onPut: (p: string[]) => void; onPreview?: (p: string) => void; compactPreview?: boolean }) {
  const [paths, setPaths] = React.useState(initial);
  const byPath = new Map(DOCS.map((d) => [d.path, d]));
  const attached: ContextAttachedItem[] = paths.map((p, position) => ({
    path: p,
    position,
    missing: !byPath.has(p),
    tokens: byPath.get(p)?.tokens ?? null,
  }));
  const total = attached.reduce((n, a) => n + (a.tokens ?? 0), 0);
  return (
    <ContextAttachList
      docs={DOCS}
      attached={attached}
      inherited={INHERITED}
      totalTokens={total}
      labels={{ ...LABELS, counter: `${paths.length} of ${DOCS.length} attached` }}
      onChange={(next) => {
        onPut(next);
        setPaths(next);
      }}
      onPreview={onPreview}
      compactPreview={compactPreview}
      title="Project context"
      hint="Order matters — see `## Project context` block."
    />
  );
}

afterEach(cleanup);

describe("ContextAttachList", () => {
  it("shows counter, token badge on every row, path-named checkboxes, inherited via-skill without checkbox, caption", () => {
    render(<Host initial={["docs/a.md"]} onPut={vi.fn()} />);
    expect(screen.getByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "docs/b.md" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "specs/c.md" })).toBeInTheDocument();
    // every attached/available row carries a token badge (AC-78)
    expect(within(screen.getByTestId("context-row-docs/a.md")).getByText("≈ 10 tok")).toBeInTheDocument();
    expect(within(screen.getByTestId("context-row-docs/b.md")).getByText("≈ 20 tok")).toBeInTheDocument();
    expect(within(screen.getByTestId("context-row-specs/c.md")).getByText("≈ 30 tok")).toBeInTheDocument();
    // inherited: via badge, no checkbox, token badge
    const inh = screen.getByTestId("context-inherited-docs/b.md");
    expect(within(inh).getByText("via Security")).toBeInTheDocument();
    expect(within(inh).queryByRole("checkbox")).toBeNull();
    expect(within(inh).getByText("≈ 20 tok")).toBeInTheDocument();
    expect(screen.getByText(/Injected as an untrusted block/)).toBeInTheDocument();
    // header: title + pill + filter on one row; hint renders the code span in mono
    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByText("## Project context")).toHaveClass("mono");
  });

  it("lists attached docs first in saved order, then unattached, in one list; preview via labelled or eye button", () => {
    const onPreview = vi.fn();
    const { rerender } = render(<Host initial={["specs/c.md"]} onPut={vi.fn()} onPreview={onPreview} />);
    const order = screen.getAllByTestId(/^context-row-/).map((r) => r.getAttribute("data-testid"));
    expect(order).toEqual(["context-row-specs/c.md", "context-row-docs/a.md", "context-row-docs/b.md"]);
    // directory shown after the name
    expect(within(screen.getByTestId("context-row-specs/c.md")).getByText("specs/")).toBeInTheDocument();
    // unattached rows expose no reorder handle
    expect(screen.queryByRole("button", { name: "Reorder docs/a.md" })).toBeNull();
    const btn = screen.getByRole("button", { name: "Preview docs/a.md" });
    expect(btn).toHaveTextContent("Preview");
    fireEvent.click(btn);
    expect(onPreview).toHaveBeenCalledWith("docs/a.md");
    rerender(<Host initial={["specs/c.md"]} onPut={vi.fn()} onPreview={onPreview} compactPreview />);
    expect(screen.getByRole("button", { name: "Preview docs/a.md" })).not.toHaveTextContent("Preview");
  });

  it("maps doc type to a badge tone", () => {
    expect(contextDocTypeTone("specs").color).toBe("var(--accent-text)");
    expect(contextDocTypeTone("docs").color).toBe("var(--ok)");
    expect(contextDocTypeTone("insights").color).toBe("var(--warn)");
    expect(contextDocTypeTone("other").color).toBe("var(--text-secondary)");
    render(<Host initial={[]} onPut={vi.fn()} />);
    expect(within(screen.getByTestId("context-row-specs/c.md")).getByText("specs")).toHaveStyle({ color: "var(--accent-text)" });
    expect(within(screen.getByTestId("context-row-docs/a.md")).getByText("docs")).toHaveStyle({ color: "var(--ok)" });
  });

  it("check appends, uncheck keeps order, footer total follows the new list", () => {
    const onPut = vi.fn();
    render(<Host initial={["docs/a.md", "docs/b.md"]} onPut={onPut} />);
    expect(screen.getByText("≈ 30 tokens")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/c.md" }));
    expect(onPut).toHaveBeenLastCalledWith(["docs/a.md", "docs/b.md", "specs/c.md"]);
    expect(screen.getByText("≈ 60 tokens")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "docs/a.md" }));
    expect(onPut).toHaveBeenLastCalledWith(["docs/b.md", "specs/c.md"]);
    expect(screen.getByText("≈ 50 tokens")).toBeInTheDocument();
  });

  it("reorders by drag and by Alt+Arrow on the handle", () => {
    const onPut = vi.fn();
    render(<Host initial={["docs/a.md", "docs/b.md", "specs/c.md"]} onPut={onPut} />);
    const dataTransfer = {};
    fireEvent.dragStart(screen.getByTestId("context-row-specs/c.md"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("context-row-docs/a.md"), { dataTransfer });
    expect(onPut).toHaveBeenLastCalledWith(["specs/c.md", "docs/a.md", "docs/b.md"]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder docs/b.md" }), { key: "ArrowUp", altKey: true });
    expect(onPut).toHaveBeenLastCalledWith(["specs/c.md", "docs/b.md", "docs/a.md"]);
    fireEvent.click(screen.getByRole("button", { name: "Move specs/c.md down" }));
    expect(onPut).toHaveBeenLastCalledWith(["docs/b.md", "specs/c.md", "docs/a.md"]);
  });

  it("filters case-insensitively by path and keeps checked state", () => {
    render(<Host initial={["docs/a.md"]} onPut={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "SPECS" } });
    expect(screen.queryByRole("checkbox", { name: "docs/a.md" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "specs/c.md" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeChecked();
  });

  it("missing attachment shows a badge and a remove action", () => {
    const onPut = vi.fn();
    render(<Host initial={["docs/gone.md", "docs/a.md"]} onPut={onPut} />);
    expect(screen.getByText("missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove docs/gone.md" }));
    expect(onPut).toHaveBeenLastCalledWith(["docs/a.md"]);
  });
});

describe("helpers", () => {
  it("arrayMove / matchesFilter / togglePath", () => {
    expect(arrayMove(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(arrayMove(["a"], 0, 5)).toEqual(["a"]);
    expect(matchesFilter("Docs/A.md", "docs/a")).toBe(true);
    expect(togglePath(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(togglePath(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
  });
});
