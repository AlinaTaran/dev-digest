import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ApiError, api } from "@/lib/api";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

// jsdom doesn't implement scrollIntoView — the target-finding effect calls it.
Element.prototype.scrollIntoView = vi.fn();

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("auto-expands + scrolls when it is the navigation target, and stays collapsed otherwise", () => {
    // Non-matching target: card stays collapsed (Accept only renders when expanded).
    const { rerender } = renderWithIntl(<FindingCard f={FINDING} targetFindingId="other" />);
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();

    // Matching target: expands and scrolls into view.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <FindingCard f={FINDING} targetFindingId="f1" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — Turn into eval case", () => {
  const accepted = { ...FINDING, accepted_at: "2026-01-01T00:00:00Z" };
  const response = (created: boolean) => ({
    case: { id: "c1", owner_kind: "agent", owner_id: "a1" },
    created,
    owner_name: "Security",
  });

  afterEach(() => vi.restoreAllMocks());

  it("is disabled with an accessible hint while the finding is undecided", () => {
    const post = vi.spyOn(api, "post");
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded />);
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
    fireEvent.click(btn);
    expect(post).not.toHaveBeenCalled();
  });

  it("creates the case once (double click), links to it, then reports an existing case", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response(false));
    renderWithIntl(<FindingCard f={accepted} defaultExpanded />);
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(await screen.findByText(/Added to Security eval set/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/findings/f1/eval-case");
    expect(screen.getByRole("link", { name: "View case" })).toHaveAttribute(
      "href",
      "/agents/a1?tab=evals&case=c1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText(/Already in Security eval set/)).toBeInTheDocument();
  });

  it("shows an inline message for a 409 reason", async () => {
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError("conflict", 409, "eval_case_unavailable", { reason: "too_large" }),
    );
    renderWithIntl(<FindingCard f={accepted} defaultExpanded />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("The diff for this finding is too large to store."),
    );
  });
  it("offers linked skills as a target, posts it, links to the skill Evals tab, maps skill_not_linked", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      agent: { id: "a1", name: "Security" },
      skills: [{ id: "s1", name: "OWASP" }],
    });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({
        case: { id: "c9", owner_kind: "skill", owner_id: "s1" },
        created: true,
        owner_name: "OWASP",
      })
      .mockRejectedValueOnce(new ApiError("conflict", 409, "eval_case_unavailable", { reason: "skill_not_linked" }));
    renderWithIntl(<FindingCard f={accepted} defaultExpanded />);
    const select = await screen.findByRole("combobox", { name: "Eval set to add the case to" });
    expect(get).toHaveBeenCalledWith("/findings/f1/eval-targets");
    fireEvent.change(select, { target: { value: "s1" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText(/Added to OWASP eval set/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/findings/f1/eval-case", { owner_kind: "skill", owner_id: "s1" });
    expect(screen.getByRole("link", { name: "View case" })).toHaveAttribute("href", "/skills/s1?tab=evals&case=c9");
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("That skill isn't linked to the review's agent."),
    );
  });

  it("lists agent first then each linked skill (3 targets for 2 skills) and posts the second skill's id (AC-74)", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      agent: { id: "a1", name: "Security" },
      skills: [
        { id: "s1", name: "OWASP" },
        { id: "s2", name: "Secrets hygiene" },
      ],
    });
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({
      case: { id: "c8", owner_kind: "skill", owner_id: "s2" },
      created: true,
      owner_name: "Secrets hygiene",
    });
    renderWithIntl(<FindingCard f={accepted} defaultExpanded />);
    const select = await screen.findByRole("combobox", { name: "Eval set to add the case to" });
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Security", "Skill: OWASP", "Skill: Secrets hygiene"]);
    expect(options[0]).toHaveValue("");
    fireEvent.change(select, { target: { value: "s2" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText(/Added to Secrets hygiene eval set/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/findings/f1/eval-case", { owner_kind: "skill", owner_id: "s2" });
  });

  it("does not fetch targets for an undecided card", () => {
    const get = vi.spyOn(api, "get");
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded />);
    expect(get).not.toHaveBeenCalled();
  });
});
