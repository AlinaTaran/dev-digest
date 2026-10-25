import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../messages/en/prReview.json";
import type { BriefRisk } from "@devdigest/shared";
import { RiskAreas } from "./RiskAreas";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const out = render(
    <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
      {ui}
    </NextIntlClientProvider>,
  );
  return { out, err };
}

const risks: BriefRisk[] = [
  {
    kind: "security",
    title: "Rate limit bypass",
    explanation: "Header can be spoofed.",
    severity: "high",
    file_refs: ["src/middleware/ratelimit.ts:12"],
  },
  {
    kind: "perf",
    title: "Extra query",
    explanation: "N+1 on list.",
    severity: "low",
    file_refs: ["src/a.ts"],
  },
];

describe("RiskAreas", () => {
  it("renders severity-named rows, toggles the explanation and opens refs", () => {
    const onOpenRef = vi.fn();
    const { err } = renderWithIntl(<RiskAreas risks={risks} onOpenRef={onOpenRef} />);
    expect(screen.getByRole("group", { name: /High severity: Rate limit bypass/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Low severity/ })).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Toggle explanation for Rate limit bypass" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Header can be spoofed.")).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Header can be spoofed.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open src/middleware/ratelimit.ts:12" }));
    expect(onOpenRef).toHaveBeenCalledWith("src/middleware/ratelimit.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts" }));
    expect(onOpenRef).toHaveBeenLastCalledWith("src/a.ts", undefined);
    expect(screen.getByTitle("src/a.ts")).toBeInTheDocument();
    expect(err).not.toHaveBeenCalled();
  });

  it("shows the empty line when there are no risks (AC-34)", () => {
    renderWithIntl(<RiskAreas risks={[]} onOpenRef={vi.fn()} />);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
