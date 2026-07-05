import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, getDefaultNormalizer } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

// Multi-line values (the Markdown body) need whitespace preserved — the
// default normalizer collapses newlines, which breaks an exact match.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };

const mutate = vi.fn();

// Mock the data hook so the tab renders without a network/query client.
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
}));

import { ConfigTab } from "./ConfigTab";

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
  body: "# Branch coverage\nEvery new branch needs a covering test.",
  enabled: true,
  version: 3,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Skills ConfigTab", () => {
  it("renders the skill's fields and version badge", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByDisplayValue("branch-coverage-gate")).toBeInTheDocument();
    expect(screen.getByDisplayValue(SKILL.description)).toBeInTheDocument();
    expect(screen.getByDisplayValue(SKILL.body, exact)).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });

  it("shows an 'unsaved' badge once a field is edited, and hides it before that", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    const body = screen.getByDisplayValue(SKILL.body, exact);
    fireEvent.change(body, { target: { value: SKILL.body + "\nAlso check for early returns." } });

    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("calls useUpdateSkill's mutate with the edited fields on Save", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    const name = screen.getByDisplayValue("branch-coverage-gate");
    fireEvent.change(name, { target: { value: "branch-coverage-gate-v2" } });

    fireEvent.click(screen.getByText("Save skill"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [arg] = mutate.mock.calls[0]!;
    expect(arg).toMatchObject({
      id: "sk1",
      patch: expect.objectContaining({ name: "branch-coverage-gate-v2", body: SKILL.body }),
    });
  });
});
