import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../messages/en/prReview.json";
import { BriefSummary } from "./BriefSummary";

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

describe("BriefSummary", () => {
  it("renders model text literally, with no img or link elements (AC-28, AC-62)", () => {
    const evil = "<img src=x onerror=alert(1)> [x](javascript:alert(1))";
    const { out } = renderWithIntl(<BriefSummary summary={evil} />);
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(out.container.querySelector("img")).toBeNull();
    expect(out.container.querySelector("a")).toBeNull();
  });

  it("shows the verdict banner above the summary when a verdict is given", () => {
    const { out } = renderWithIntl(
      <BriefSummary
        summary="Adds rate limiting."
        verdict={{ verdict: "request_changes", score: 61, findingsCount: 3, blockers: 1 }}
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    const summary = screen.getByText("Adds rate limiting.");
    const banner = screen.getByText("Request changes");
    expect(banner.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(out.container.querySelectorAll("p")).toHaveLength(1);
  });
});
