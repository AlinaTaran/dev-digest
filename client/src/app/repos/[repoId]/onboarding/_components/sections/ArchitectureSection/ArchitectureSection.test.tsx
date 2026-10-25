import React from "react";
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import type { OnboardingArchitectureSection } from "@devdigest/shared";
import { renderWithIntl, REPO, SHA } from "../test-kit";
import { ArchitectureSection } from "./ArchitectureSection";

const base: OnboardingArchitectureSection = {
  kind: "architecture",
  empty_reason: null,
  summary_md: "Entry is `src/app.ts`.",
  top_dirs: [{ path: "src", files: 1 }, { path: "test", files: 4 }],
  diagram: {
    nodes: [
      { id: "a", label: "Web", kind: "client", path: null },
      { id: "b", label: "API", kind: "entrypoint", path: "src/my app.ts" },
      { id: "c", label: "<img src=x onerror=alert(1)>", kind: "module", path: null },
    ],
    edges: [{ from: "a", to: "b", label: "HTTP" }, { from: "b", to: "c", label: null }, { from: "b", to: "zzz", label: null }],
  },
};

const view = (s: OnboardingArchitectureSection) =>
  renderWithIntl(<ArchitectureSection section={s} repoFullName={REPO} sourceSha={SHA} />);

describe("ArchitectureSection", () => {
  it("renders refs as code, top dirs with counts, and an accessible, safe diagram", () => {
    const { container } = view(base);

    expect(screen.getByText("src/app.ts").tagName).toBe("CODE");
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getByText("4 files")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "API (entrypoint)" });
    expect(link).toHaveAttribute("href", `https://github.com/${REPO}/blob/${SHA}/src/my%20app.ts`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("group", { name: "Web (client)" })).toHaveAttribute("tabindex", "0");

    const legend = screen.getByText("Legend").parentElement!;
    expect(within(legend).getByText("client")).toBeInTheDocument();
    expect(within(legend).getByText("entrypoint")).toBeInTheDocument();
    expect(within(legend).getByText("module")).toBeInTheDocument();
    expect(within(legend).queryByText("datastore")).not.toBeInTheDocument();

    // Label is literal text, never markup; edges to unknown nodes are skipped.
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("<img src=x onerror=alert(1)>").length).toBeGreaterThan(0);
    expect(screen.getByText("Web → API (HTTP)")).toBeInTheDocument();
    expect(screen.queryByText(/zzz/)).not.toBeInTheDocument();
  });

  it("neutralises script and javascript: links in the summary and omits a null diagram", () => {
    const { container } = view({
      ...base,
      summary_md: "<script>alert(1)</script>[x](javascript:alert(1))",
      diagram: null,
    });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.queryByLabelText("Architecture diagram")).not.toBeInTheDocument();
    expect(screen.queryByText("Legend")).not.toBeInTheDocument();
  });
});
