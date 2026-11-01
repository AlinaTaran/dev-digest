import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../messages/en/prReview.json";
import { StaleBanner } from "./StaleBanner";
import { MissingInputsNote } from "./MissingInputsNote";
import { BriefError } from "./BriefError";

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

describe("BriefNotices", () => {
  it("MissingInputsNote lists inputs in spec order, and renders nothing when empty", () => {
    renderWithIntl(<MissingInputsNote missing={["blast", "intent"]} />);
    expect(screen.getByText("Generated without: Intent, Blast radius")).toBeInTheDocument();
    cleanup();
    const again = renderWithIntl(<MissingInputsNote missing={[]} />);
    expect(again.out.container).toBeEmptyDOMElement();
  });

  it("StaleBanner shows 7-char shas and regenerates", () => {
    const onRegenerate = vi.fn();
    const { err } = renderWithIntl(
      <StaleBanner briefSha="abcdef0123456" currentSha="9876543210fed" onRegenerate={onRegenerate} pending={false} />,
    );
    expect(screen.getByText("This brief was generated for abcdef0; the PR is now at 9876543")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate brief" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
  });

  it("BriefError covers config, unsynced and retryable reasons", () => {
    const onRetry = vi.fn();
    renderWithIntl(<BriefError reason="llm_not_configured" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No API key is configured");
    expect(screen.getByRole("link", { name: "Open Settings → API keys" })).toHaveAttribute(
      "href",
      "/settings/api-keys",
    );
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();

    renderWithIntl(<BriefError reason="pr_not_synced" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no synced files yet");
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();

    renderWithIntl(<BriefError reason="timeout" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't generate the brief: the model didn't answer within 60 seconds",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();

    renderWithIntl(<BriefError reason="weird" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("an unexpected error occurred");
  });
});
