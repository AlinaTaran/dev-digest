import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../messages/en/prReview.json";
import { BriefSkeleton } from "./BriefSkeleton";

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

describe("BriefSkeleton", () => {
  it("is a named status region with aria-hidden placeholders", () => {
    const { out } = renderWithIntl(<BriefSkeleton />);
    expect(screen.getByRole("status", { name: "Generating…" })).toBeInTheDocument();
    expect(out.container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    for (const el of out.container.querySelectorAll(".skeleton")) {
      expect(el.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});
