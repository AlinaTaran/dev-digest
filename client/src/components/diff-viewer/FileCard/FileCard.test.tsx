import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, Finding } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
  vi.useRealTimers();
});

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );

const CONFIG: PrFile = {
  path: "src/config.ts",
  additions: 12,
  deletions: 0,
  patch: "@@ -1,1 +1,13 @@\n context\n" + Array.from({ length: 12 }, (_, i) => `+line ${i + 2}`).join("\n"),
};

const FINDING: Finding = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "t",
  file: "src/config.ts",
  start_line: 5,
  end_line: 5,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
};

const lineEl = (path: string, n: number) => document.getElementById(`diff-line:${path}:${n}`)!;

describe("FileCard deep-link target", () => {
  it("scrolls to and flashes the target line, then restores after 1.5s (AC-42)", () => {
    const onReached = vi.fn();
    wrap(<FileCard file={CONFIG} defaultOpen={false} forceOpen scrollToLine={12} onTargetReached={onReached} />);
    const el = lineEl("src/config.ts", 12);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.instances[0]).toBe(el);
    expect(el.style.backgroundColor).toBe("var(--accent-bg)");
    expect(onReached).toHaveBeenCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(el.style.backgroundColor).not.toBe("var(--accent-bg)");
  });

  it("the findings badge flash also clears (regression for the self-cancelling timer)", () => {
    wrap(<FileCard file={CONFIG} findings={[FINDING]} findingsLabel="1 finding" defaultOpen={false} />);
    fireEvent.click(screen.getByRole("button", { name: "1 finding" }));
    const el = lineEl("src/config.ts", 5);
    expect(el.style.backgroundColor).toBe("var(--accent-bg)");
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(el.style.backgroundColor).not.toBe("var(--accent-bg)");
  });

  it("scrolls the header and shows the message when the line is not in the diff (AC-45)", () => {
    const onReached = vi.fn();
    wrap(
      <FileCard
        file={CONFIG}
        forceOpen
        scrollToLine={999}
        lineNotInDiffText="Line 999 isn't in the current diff"
        onTargetReached={onReached}
      />,
    );
    expect(screen.getByText("Line 999 isn't in the current diff")).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(onReached).toHaveBeenCalledWith(false);
  });

  it("renders real lines for a mechanical file when forced open (AC-44)", () => {
    const pkg: PrFile = {
      path: "package.json",
      additions: 1,
      deletions: 0,
      patch: "@@ -33,1 +33,2 @@\n ctx\n+  \"dep\": \"1\"",
    };
    wrap(
      <FileCard file={pkg} mechanical mechanicalPlaceholderText="PLACEHOLDER" forceOpen scrollToLine={34} />,
    );
    expect(screen.queryByText("PLACEHOLDER")).toBeNull();
    expect(lineEl("package.json", 34)).toBeTruthy();
  });

  it("opens a large collapsed file when forced open (AC-41)", () => {
    const big: PrFile = { ...CONFIG, additions: 5000 };
    wrap(<FileCard file={big} />);
    expect(lineEl("src/config.ts", 12)).toBeNull();
    cleanup();
    wrap(<FileCard file={big} forceOpen />);
    expect(lineEl("src/config.ts", 12)).toBeTruthy();
  });
});
