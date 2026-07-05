import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const mutate = vi.fn();

// Mock the data hook so the card renders without a network/query client,
// same approach as FindingsPanel.test.tsx / SkillsTab.test.tsx.
vi.mock("@/lib/hooks/conventions", () => ({
  useUpdateConvention: () => ({ mutate, isPending: false, variables: undefined }),
}));

import { ConventionCandidateCard } from "./ConventionCandidateCard";

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  rule: "Use camelCase for filenames",
  category: "naming",
  evidence_path: "src/config.ts",
  evidence_line_start: 11,
  evidence_line_end: 11,
  evidence_snippet: "const fooBar = 1;",
  confidence: 0.9,
  status: "pending",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => mutate.mockClear());
afterEach(cleanup);

describe("ConventionCandidateCard (smoke)", () => {
  it("renders the rule, evidence path:line and category", () => {
    renderWithIntl(<ConventionCandidateCard candidate={CANDIDATE} repoId="r1" />);
    expect(screen.getByText("Use camelCase for filenames")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
    expect(screen.getByText("naming")).toBeInTheDocument();
  });

  it("fires the accept mutation with the candidate id and accepted status", () => {
    renderWithIntl(<ConventionCandidateCard candidate={CANDIDATE} repoId="r1" />);
    fireEvent.click(screen.getByText("Accept"));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "accepted" } });
  });

  it("fires the reject mutation with the candidate id and rejected status", () => {
    renderWithIntl(<ConventionCandidateCard candidate={CANDIDATE} repoId="r1" />);
    fireEvent.click(screen.getByText("Reject"));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "rejected" } });
  });

  it("commits an edited rule on blur", () => {
    renderWithIntl(<ConventionCandidateCard candidate={CANDIDATE} repoId="r1" />);
    // Before editing starts, "Edit rule" only labels the pencil IconBtn.
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    // Once editing, the input shares the same aria-label as the IconBtn, so
    // disambiguate by role (textbox vs button).
    const input = screen.getByRole("textbox", { name: "Edit rule" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Use PascalCase for components" } });
    fireEvent.blur(input);
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { rule: "Use PascalCase for components" } });
  });

  it("does not fire a mutation when the rule is blurred unchanged", () => {
    renderWithIntl(<ConventionCandidateCard candidate={CANDIDATE} repoId="r1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    const input = screen.getByRole("textbox", { name: "Edit rule" }) as HTMLInputElement;
    fireEvent.blur(input);
    expect(mutate).not.toHaveBeenCalled();
  });
});
