import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import smartDiffMessages from "../../../../../../../../messages/en/smart-diff.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

let search = "tab=diff&file=src%2Fconfig.ts&line=12";
let smartData: SmartDiff | undefined;

vi.mock("next/navigation", () => ({
  usePathname: () => "/repos/r1/pulls/1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => ({ data: smartData }) }));

import { DiffTab } from "./DiffTab";

const scrollIntoView = vi.fn();
beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  search = "tab=diff&file=src%2Fconfig.ts&line=12";
  smartData = {
    groups: [
      {
        role: "wiring",
        files: [{ path: "src/config.ts", pseudocode_summary: null, additions: 5000, deletions: 0, finding_lines: [] }],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
  };
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
});

const patch = "@@ -1,1 +1,13 @@\n context\n" + Array.from({ length: 12 }, (_, i) => `+l${i + 2}`).join("\n");
const FILES: PrFile[] = [{ path: "src/config.ts", additions: 5000, deletions: 0, patch }];

const renderTab = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: briefMessages, "smart-diff": smartDiffMessages, shell: shellMessages }}
      onError={(e) => {
        throw e;
      }}
    >
      <DiffTab prId="p1" filesCount={1} files={FILES} />
    </NextIntlClientProvider>,
  );

const line12 = () => document.getElementById("diff-line:src/config.ts:12");

describe("DiffTab deep link", () => {
  it("cold direct URL opens a collapsed card, scrolls to the line and announces it (AC-43)", () => {
    renderTab();
    expect(line12()).toBeTruthy();
    expect(scrollIntoView.mock.instances).toContain(line12());
    expect(screen.getByText("Line 12 of src/config.ts")).toBeTruthy();
  });

  it("works in original order and with the plain fallback viewer (AC-47)", () => {
    search += "&order=original";
    renderTab();
    expect(scrollIntoView.mock.instances).toContain(line12());
    cleanup();
    scrollIntoView.mockClear();
    smartData = undefined;
    renderTab();
    expect(scrollIntoView.mock.instances).toContain(line12());
  });

  it("shows a note and does not scroll when the file is not in the diff (AC-46)", () => {
    search = "tab=diff&file=src%2Fapi%2Fpublic%2Fhealth.ts&line=3";
    renderTab();
    expect(screen.getByText("File not in this PR's diff: src/api/public/health.ts")).toBeTruthy();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
