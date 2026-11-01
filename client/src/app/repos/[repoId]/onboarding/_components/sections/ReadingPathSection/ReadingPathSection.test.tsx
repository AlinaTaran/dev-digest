import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl, REPO, SHA } from "../test-kit";
import { ReadingPathSection } from "./ReadingPathSection";

describe("ReadingPathSection", () => {
  it("renders numbered steps linking to the blob in a new tab, with why as plain text", () => {
    const { container } = renderWithIntl(
      <ReadingPathSection
        repoFullName={REPO}
        sourceSha={SHA}
        section={{
          kind: "reading_path",
          empty_reason: null,
          steps: [
            { path: "src/index.ts", why: "Start here" },
            { path: "src/доc.ts", why: "<i>then</i> this" },
          ],
        }}
      />,
    );

    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    const first = screen.getByRole("link", { name: "Open src/index.ts on GitHub" });
    expect(first).toHaveAttribute("href", `https://github.com/${REPO}/blob/${SHA}/src/index.ts`);
    expect(first).toHaveAttribute("target", "_blank");
    expect(first).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText("<i>then</i> this")).toBeInTheDocument();
    expect(container.querySelector("i")).toBeNull();
  });
});
