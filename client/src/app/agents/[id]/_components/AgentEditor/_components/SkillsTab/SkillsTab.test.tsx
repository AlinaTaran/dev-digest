import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const mutate = vi.fn();

// Mock the data hooks so SkillsTab renders without a network/query client.
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
  useAgentSkills: () => ({ data: LINKED }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a code reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function skill(over: Partial<Skill>): Skill & { agent_count: number } {
  return {
    id: "s0",
    name: "Skill",
    description: "",
    type: "rubric",
    source: "manual",
    body: "a".repeat(40), // ~10 tokens
    enabled: true,
    version: 1,
    agent_count: 0,
    ...over,
  };
}

const SKILLS = [
  skill({ id: "s1", name: "Branch coverage gate" }),
  skill({ id: "s2", name: "Corner case checklist" }),
  skill({ id: "s3", name: "Mock overuse gate", enabled: false }),
];

// Rows given out of order to prove the tab sorts by `order` ASC: s1 (order 0)
// then s2 (order 1) attached, both enabled; s3 unattached. The real
// /agents/:id/skills endpoint returns bare AgentSkillLink rows (agent_id/
// skill_id/order), not a joined skill object — mock that shape exactly so
// this test would have caught the real skill_id-vs-skill.id mismatch.
const LINKED = [
  { agent_id: "ag1", skill_id: "s2", order: 1 },
  { agent_id: "ag1", skill_id: "s1", order: 0 },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agents: messages }}>{ui}</NextIntlClientProvider>);
}

beforeEach(() => mutate.mockClear());
afterEach(cleanup);

describe("SkillsTab", () => {
  it("renders all workspace skills with attach state and header count", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("Branch coverage gate")).toBeInTheDocument();
    expect(screen.getByText("Corner case checklist")).toBeInTheDocument();
    expect(screen.getByText("Mock overuse gate")).toBeInTheDocument();

    // 2 linked (s1, s2) and both are enabled -> "2 of 3 enabled"
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    // Attached rows (s1 then s2, order ASC) render before the unattached one.
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "true");
    expect(checkboxes[1]).toHaveAttribute("aria-checked", "true");
    expect(checkboxes[2]).toHaveAttribute("aria-checked", "false");
  });

  it("attaching an unattached skill posts the extended ordered id list", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[2]!); // attach s3 (unattached, currently last)

    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s1", "s2", "s3"] });
  });

  it("detaching an attached skill posts the remaining ordered id list", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!); // detach s1 (first attached row, order 0)

    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s2"] });
  });

  it("dragging an attached row over another reorders and posts the new order", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const rowS2 = screen.getByTestId("skill-row-s2");
    const rowS1 = screen.getByTestId("skill-row-s1");

    const dataTransfer = {};
    fireEvent.dragStart(rowS2, { dataTransfer });
    fireEvent.dragOver(rowS1, { dataTransfer });
    fireEvent.drop(rowS1, { dataTransfer });

    // s2 (dragged) is inserted at s1's slot (index 0), pushing s1 after it.
    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s2", "s1"] });
  });
});
