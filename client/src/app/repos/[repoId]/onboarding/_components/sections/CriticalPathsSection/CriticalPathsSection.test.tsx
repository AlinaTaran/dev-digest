import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl, REPO, SHA } from "../test-kit";
import { CriticalPathsSection } from "./CriticalPathsSection";

describe("CriticalPathsSection", () => {
  it("shows path, why and fan-in, and links Open to the blob pinned to the sha", () => {
    renderWithIntl(
      <CriticalPathsSection
        repoFullName={REPO}
        sourceSha={SHA}
        section={{
          kind: "critical_paths",
          empty_reason: null,
          items: [
            { path: "src/db.ts", why: "Shared pool", fan_in: 12 },
            { path: "src/a b.ts", why: null, fan_in: 1 },
          ],
        }}
      />,
    );

    expect(screen.getByTitle("src/db.ts")).toBeInTheDocument();
    expect(screen.getByText("— Shared pool")).toBeInTheDocument();
    expect(screen.getByText("imported by 12 files")).toBeInTheDocument();
    expect(screen.getByText("imported by 1 file")).toBeInTheDocument();

    const open = screen.getByRole("link", { name: "Open src/a b.ts on GitHub" });
    expect(open).toHaveAttribute("href", `https://github.com/${REPO}/blob/${SHA}/src/a%20b.ts`);
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
    expect(open).toHaveTextContent("Open");
  });
});
