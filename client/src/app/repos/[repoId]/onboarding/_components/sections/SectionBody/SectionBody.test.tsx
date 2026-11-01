import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl, REPO, SHA } from "../test-kit";
import { SectionBody } from "./SectionBody";

describe("SectionBody", () => {
  it("shows the empty-reason message instead of an empty card, and no scaffold copy", () => {
    const { unmount, container } = renderWithIntl(
      <SectionBody
        repoFullName={REPO}
        sourceSha={SHA}
        section={{ kind: "critical_paths", empty_reason: "all_dropped", items: [] }}
      />,
    );
    expect(screen.getByText("Nothing verifiable to show")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/key modules/i);

    unmount();
    renderWithIntl(
      <SectionBody
        repoFullName={REPO}
        sourceSha={SHA}
        section={{ kind: "first_tasks", empty_reason: "needs_llm", tasks: [] }}
      />,
    );
    expect(screen.getByText(/Needs a language model/)).toBeInTheDocument();
  });

  it("dispatches a populated section to its renderer", () => {
    renderWithIntl(
      <SectionBody
        repoFullName={REPO}
        sourceSha={SHA}
        section={{
          kind: "reading_path",
          empty_reason: null,
          steps: [{ path: "src/index.ts", why: "Start" }],
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Open src/index.ts on GitHub" })).toBeInTheDocument();
  });
});
