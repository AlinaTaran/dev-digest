import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, Finding, SmartDiff } from "@devdigest/shared";
import smartDiffMessages from "../../../../messages/en/smart-diff.json";
import shellMessages from "../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

// jsdom doesn't implement scrollIntoView — the findings-badge click handler calls it.
Element.prototype.scrollIntoView = vi.fn();

const FILES: PrFile[] = [
  {
    path: "package-lock.json",
    additions: 400,
    deletions: 2,
    patch: "@@ -1,1 +1,2 @@\n-old\n+new\n+another",
  },
  {
    path: "src/core/pricing.ts",
    additions: 12,
    deletions: 3,
    patch: "@@ -1,3 +1,4 @@\n context\n-const x = 1;\n+const x = 2;\n+const y = 3;",
  },
  {
    path: "src/config.ts",
    additions: 2,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n context\n+const secret = 'shh';",
  },
];

const FINDING: Finding = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 2,
  end_line: 2,
  rationale: "A secret is committed in source.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
};

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/core/pricing.ts", pseudocode_summary: null, additions: 12, deletions: 3, finding_lines: [] },
      ],
    },
    {
      role: "wiring",
      files: [
        { path: "src/config.ts", pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [2] },
      ],
    },
    {
      role: "boilerplate",
      files: [
        {
          path: "package-lock.json",
          pseudocode_summary: null,
          additions: 400,
          deletions: 2,
          finding_lines: [],
        },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
};

function renderViewer(
  findingsByPath: Map<string, Finding[]>,
  grouped = true,
  onFindingClick?: (id: string) => void,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ "smart-diff": smartDiffMessages, shell: shellMessages }}>
      <SmartDiffViewer
        smartDiff={SMART_DIFF}
        files={FILES}
        findingsByPath={findingsByPath}
        grouped={grouped}
        onFindingClick={onFindingClick}
      />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("groups files by role, floats core open, collapses boilerplate, and surfaces a clickable findings badge with a severity chip", () => {
    const findingsByPath = new Map<string, Finding[]>([["src/config.ts", [FINDING]]]);
    renderViewer(findingsByPath);

    // Boilerplate: the lock file lands in the Boilerplate group, collapsed by default.
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
    expect(screen.getByText("package-lock.json")).toBeInTheDocument();
    expect(screen.queryByText("another")).not.toBeInTheDocument(); // body not rendered while closed

    // Core: open by default — its diff content is already visible, no click needed.
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("const y = 3;")).toBeInTheDocument();

    // Wiring file has a finding: shows the "N findings" badge + a severity chip on its line.
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    const badge = screen.getByRole("button", { name: "1 findings" });
    expect(screen.getByText("blocker")).toBeInTheDocument(); // CRITICAL -> "blocker" chip

    // Clicking the badge force-opens the card and scrolls to the finding's line.
    fireEvent.click(badge);
    expect(screen.getByText("const secret = 'shh';")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("without onFindingClick the severity chip is a static span, not a button", () => {
    renderViewer(new Map<string, Finding[]>([["src/config.ts", [FINDING]]]));
    expect(screen.getByText("blocker")).toBeInTheDocument();
    // The only button named for finding-navigation should be absent.
    expect(
      screen.queryByRole("button", { name: "Go to this finding in Agent runs" }),
    ).not.toBeInTheDocument();
  });

  it("with onFindingClick the chip becomes a button that reports the highest-severity finding's id", () => {
    const onFindingClick = vi.fn();
    // Two findings share line 2 of src/config.ts: a WARNING and a CRITICAL. The
    // chip (and thus the click) must resolve to the CRITICAL one (id "f1").
    const lowerOnSameLine: Finding = { ...FINDING, id: "f2", severity: "WARNING", title: "Lower" };
    renderViewer(
      new Map<string, Finding[]>([["src/config.ts", [lowerOnSameLine, FINDING]]]),
      true,
      onFindingClick,
    );

    const chip = screen.getByRole("button", { name: "Go to this finding in Agent runs" });
    expect(chip).toHaveTextContent("blocker"); // CRITICAL wins the line
    fireEvent.click(chip);
    expect(onFindingClick).toHaveBeenCalledWith("f1");
  });

  it("renders the same enhanced cards flat, in the PR's own file order, when ungrouped", () => {
    const { container } = renderViewer(new Map(), false);

    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    expect(screen.queryByText("Core")).not.toBeInTheDocument();

    const text = container.textContent ?? "";
    // Original order === `files` array order, not risk order.
    expect(text.indexOf("package-lock.json")).toBeLessThan(text.indexOf("src/core/pricing.ts"));
    expect(text.indexOf("src/core/pricing.ts")).toBeLessThan(text.indexOf("src/config.ts"));
  });
});
