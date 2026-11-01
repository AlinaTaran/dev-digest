import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { OnboardingFirstTasksSection } from "@devdigest/shared";
import { renderWithIntl, REPO, SHA } from "../test-kit";
import { FirstTasksSection } from "./FirstTasksSection";

const long = `src/${"x".repeat(200)}.ts`;
const section: OnboardingFirstTasksSection = {
  kind: "first_tasks",
  empty_reason: null,
  tasks: [
    { title: "Fix a file", path: "src/a.ts", path_kind: "file", complexity: "low" },
    { title: "Tidy a dir", path: "src/lib/", path_kind: "dir", complexity: "medium" },
    { title: "Add a util", path: "src/lib/new.ts", path_kind: "new_file", complexity: "low" },
    { title: "Root file", path: "new.ts", path_kind: "new_file", complexity: "low" },
    { title: "Long", path: long, path_kind: "file", complexity: "medium" },
  ],
};

describe("FirstTasksSection", () => {
  it("renders cards with per-kind links, badges, new-file marker and full long paths", () => {
    renderWithIntl(<FirstTasksSection section={section} repoFullName={REPO} sourceSha={SHA} />);
    const gh = `https://github.com/${REPO}`;

    expect(screen.getByRole("link", { name: "Open src/a.ts on GitHub" })).toHaveAttribute("href", `${gh}/blob/${SHA}/src/a.ts`);
    expect(screen.getByRole("link", { name: "Open src/lib/ on GitHub" })).toHaveAttribute("href", `${gh}/tree/${SHA}/src/lib`);
    expect(screen.getByRole("link", { name: "Open src/lib/new.ts on GitHub" })).toHaveAttribute("href", `${gh}/tree/${SHA}/src/lib`);
    expect(screen.getByRole("link", { name: "Open new.ts on GitHub" })).toHaveAttribute("href", `${gh}/tree/${SHA}`);
    const longLink = screen.getByRole("link", { name: `Open ${long} on GitHub` });
    expect(longLink).toHaveAttribute("title", long);
    expect(longLink).toHaveAttribute("target", "_blank");
    expect(longLink).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getAllByText("new file")).toHaveLength(2);
    expect(screen.getAllByText("Low complexity")).toHaveLength(3);
    expect(screen.getAllByText("Medium complexity")).toHaveLength(2);
    expect(screen.getByText("Fix a file")).toBeInTheDocument();
  });
});
