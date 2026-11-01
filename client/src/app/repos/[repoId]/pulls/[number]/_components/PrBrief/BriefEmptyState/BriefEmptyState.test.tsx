import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../messages/en/prReview.json";
import { BriefEmptyState } from "./BriefEmptyState";

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

describe("BriefEmptyState", () => {
  it("offers one Generate button, then shows a busy disabled state while pending", () => {
    const onGenerate = vi.fn();
    const { err } = renderWithIntl(<BriefEmptyState onGenerate={onGenerate} pending={false} />);
    const btn = screen.getByRole("button", { name: "Generate brief" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(btn);
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(brief.prBrief.emptyBody)).toBeInTheDocument();
    expect(err).not.toHaveBeenCalled();
    cleanup();

    renderWithIntl(<BriefEmptyState onGenerate={onGenerate} pending />);
    const busy = screen.getByRole("button", { name: "Generating…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(brief.prBrief.emptyBody)).toBeInTheDocument();
    expect(screen.queryByText("Run a review or open the PR to compute it.")).not.toBeInTheDocument();
  });
});
