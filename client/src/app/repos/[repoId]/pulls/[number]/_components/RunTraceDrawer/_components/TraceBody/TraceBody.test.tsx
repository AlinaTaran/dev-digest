import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

const SPECS_TEXT = "### specs/a.md\nline one\n\nline   two  ";

const BASE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 1, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 2, grounding: "2/2 passed", cost_usd: null },
  prompt_assembly: {
    system: "sys",
    skills: null,
    memory: null,
    repo_map: "skeleton",
    specs: SPECS_TEXT,
    callers: "callers text",
    user: "diff",
  },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: ["specs/a.md", "docs/b.md"],
  specs_tokens: [
    { path: "specs/a.md", tokens: 120 },
    { path: "docs/b.md", tokens: 30 },
  ],
  specs_missing: ["specs/gone.md"],
  log: [],
};

afterEach(cleanup);

function renderBody(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={trace} findings={[]} />
    </NextIntlClientProvider>,
  );
}

describe("TraceBody project context", () => {
  it("shows per-path tokens, missing specs, block label/order and byte-exact text", () => {
    renderBody(BASE);

    const readRow = screen.getByText("Specs read").parentElement as HTMLElement;
    expect(within(readRow).getByText(/specs\/a\.md/)).toHaveTextContent("≈ 120 tokens");
    expect(within(readRow).getByText(/docs\/b\.md/)).toHaveTextContent("≈ 30 tokens");
    expect(within(readRow).queryByText(/gone\.md/)).not.toBeInTheDocument();

    const missingRow = screen.getByText("Specs missing").parentElement as HTMLElement;
    expect(within(missingRow).getByText("specs/gone.md")).toBeInTheDocument();

    // Stats tile unchanged: in→out.
    expect(screen.getByText("12k→1.5k")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Prompt assembly"));
    const label = "Project context — attached specs (untrusted)";
    const labels = screen.getAllByText(/\(dynamic\)|\(untrusted\)/).map((n) => n.textContent);
    expect(labels).toEqual([
      "Repo skeleton — repo-intel (dynamic)",
      label,
      "Callers of changed symbols — repo-intel (dynamic)",
      "User / diff (dynamic)",
    ]);
    // Block token badge is the sum of specs_tokens.
    const head = screen.getByText(label).parentElement as HTMLElement;
    expect(within(head).getByText("~150 tokens")).toBeInTheDocument();

    fireEvent.click(within(head).getByText("expand"));
    const pre = document.querySelector("pre") as HTMLElement;
    expect(pre.textContent).toBe(SPECS_TEXT);
  });

  it("renders an old trace without the new fields", () => {
    const old: RunTrace = { ...BASE };
    delete old.specs_tokens;
    delete old.specs_missing;
    renderBody(old);

    const readRow = screen.getByText("Specs read").parentElement as HTMLElement;
    expect(within(readRow).getByText("specs/a.md")).toBeInTheDocument();
    expect(readRow).not.toHaveTextContent("tokens");
    expect(screen.queryByText("Specs missing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Prompt assembly"));
    // Falls back to the 4-chars/token estimate of the specs text.
    expect(screen.getByText(`~${Math.round(SPECS_TEXT.length / 4)} tokens`)).toBeInTheDocument();
  });
});
