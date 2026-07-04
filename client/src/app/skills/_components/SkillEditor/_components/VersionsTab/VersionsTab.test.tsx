import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const mutate = vi.fn();
const VERSIONS = [
  { skill_id: "sk1", version: 2, body: "# Rule\nCheck A.\nCheck B.", created_at: "2026-06-02T00:00:00Z" },
  { skill_id: "sk1", version: 1, body: "# Rule\nCheck A.", created_at: "2026-06-01T00:00:00Z" },
];

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "branch-coverage-gate",
  description: "Flags PRs that add branches without covering tests",
  type: "rubric",
  source: "manual",
  body: "# Rule\nCheck A.\nCheck B.",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Skills VersionsTab", () => {
  it("lists versions and renders a diff on demand when a row's Diff button is clicked", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v1").length).toBeGreaterThan(0);
    expect(screen.getByText("Current")).toBeInTheDocument();
    // No diff until a row's Diff button is clicked.
    expect(screen.queryByText("Check B.")).not.toBeInTheDocument();

    // Clicking Diff on the older row diffs it against the current (newest) body —
    // v2 adds "Check B." over v1, so it should surface as an added line.
    fireEvent.click(screen.getByText("Diff"));
    expect(screen.getByText("Check B.")).toBeInTheDocument();
  });

  it("calls useUpdateSkill's mutate with the old body when restoring a version", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("Restore"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [arg] = mutate.mock.calls[0]!;
    expect(arg).toMatchObject({ id: "sk1", patch: { body: "# Rule\nCheck A." } });
  });
});
