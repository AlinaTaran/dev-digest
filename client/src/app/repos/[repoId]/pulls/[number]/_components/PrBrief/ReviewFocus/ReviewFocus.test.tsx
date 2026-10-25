import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../messages/en/prReview.json";
import type { BriefRisk, ReviewFocusItem } from "@devdigest/shared";
import { ReviewFocus } from "./ReviewFocus";
import { RiskAreas } from "../RiskAreas/RiskAreas";
import { StaleBanner } from "../BriefNotices/StaleBanner";
import { MissingInputsNote } from "../BriefNotices/MissingInputsNote";
import { BriefError } from "../BriefNotices/BriefError";

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

const items: ReviewFocusItem[] = [
  { file: "src/config.ts", line: 12, reason: "Default flipped", line_adjusted: false },
  { file: "src/b.ts", line: 3, reason: "New branch", line_adjusted: true },
];

describe("ReviewFocus", () => {
  it("lists items in order with a count badge and opens file:line", () => {
    const onOpen = vi.fn();
    const { out } = renderWithIntl(<ReviewFocus items={items} onOpen={onOpen} />);
    const list = out.container.querySelector("ol");
    expect(list).toHaveAttribute("data-brief-section", "review-focus");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("src/config.ts:12 — Default flipped");
    expect(buttons[0]).toHaveAccessibleName("Open src/config.ts at line 12: Default flipped");
    expect(buttons[1]).toHaveTextContent("src/b.ts:3");
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(buttons[0]!);
    expect(onOpen).toHaveBeenCalledWith("src/config.ts", 12);
  });

  it("shows the empty copy and a 0 badge (AC-40)", () => {
    renderWithIntl(<ReviewFocus items={[]} onOpen={vi.fn()} />);
    expect(screen.getByText(/Nothing verifiable to focus on/)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("no brief button is named like a tab: Files changed / Agent runs", () => {
    const risks: BriefRisk[] = [
      { kind: "x", title: "T", explanation: "E", severity: "medium", file_refs: ["a.ts:1"] },
    ];
    renderWithIntl(
      <>
        <StaleBanner briefSha="abcdef0123" currentSha="1234567890" onRegenerate={vi.fn()} pending={false} />
        <MissingInputsNote missing={["intent"]} />
        <RiskAreas risks={risks} onOpenRef={vi.fn()} />
        <ReviewFocus items={items} onOpen={vi.fn()} />
        <BriefError reason="timeout" onRetry={vi.fn()} />
      </>,
    );
    expect(screen.getAllByRole("button").length).toBeGreaterThan(3);
    expect(screen.queryAllByRole("button", { name: /Files changed/ })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Agent runs/ })).toHaveLength(0);
  });
});
