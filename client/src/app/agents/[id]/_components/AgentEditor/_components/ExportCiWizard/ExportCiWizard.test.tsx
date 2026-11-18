import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import ci from "../../../../../../../../messages/en/ci.json";

vi.mock("next/navigation", () => ({ usePathname: () => "/agents/a1" }));

import { RepoProvider } from "@/lib/repo-context";
import { ExportCiWizard } from "./ExportCiWizard";

const AGENT = { id: "a1", name: "Security Reviewer", provider: "openrouter", model: "m" } as Agent;
const json = (b: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }));

const REPOS = [
  { id: "r1", full_name: "acme/payments-api" },
  { id: "r2", full_name: "acme/web" },
];

const previewFiles = (triggers: string[]) => ({
  files: [
    { path: ".devdigest/agents/security-reviewer.yaml", contents: '{ "name": "Security Reviewer" }', editable: false },
    { path: ".devdigest/skills/injection-guard.md", contents: "# Injection guard", editable: false },
    { path: ".devdigest/runner/index.js", contents: "", editable: false, version: "abc123def456" },
    {
      path: ".github/workflows/devdigest-review-security-reviewer.yml",
      contents: `on:\n  pull_request:\n    types: [${triggers.join(", ")}]`,
      editable: true,
    },
  ],
});

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}
let calls: Call[];
let exportResponse: () => Promise<Response>;
const createObjectURL = vi.fn(() => "blob:x");

beforeEach(() => {
  calls = [];
  localStorage.setItem("dd-repo", "r2");
  exportResponse = () =>
    json({ installation: {}, files: [], pr_url: "https://github.com/acme/web/pull/7" });
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Call["body"]) : undefined;
      calls.push({ method, path: u.pathname, body });
      if (u.pathname === "/repos") return json(REPOS);
      if (u.pathname === "/agents/a1/ci/preview") return json(previewFiles((body?.triggers as string[]) ?? []));
      if (u.pathname === "/agents/a1/export-ci") {
        return body?.action === "zip"
          ? Promise.resolve(new Response("zip-bytes", { headers: { "content-type": "application/zip" } }))
          : exportResponse();
      }
      if (u.pathname === "/agents/a1/ci") return json({ ci_fail_on: "critical", installations: [] });
      return json({ error: { code: "x", message: "unexpected " + u.pathname } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  createObjectURL.mockClear();
});

function renderWizard(agent: Agent = AGENT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci }}>
        <RepoProvider>
          <ExportCiWizard agent={agent} onClose={() => {}} />
        </RepoProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const previewCalls = () => calls.filter((c) => c.path === "/agents/a1/ci/preview");

describe("ExportCiWizard", () => {
  it("Target: one GitHub Actions card, repo select defaulting to the active repo, blocks non-OpenRouter agents", async () => {
    renderWizard();
    // step 1 of 4: the stepper shows all four labels and there is no Back button yet
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
    expect(screen.getByText("recommended")).toBeInTheDocument();
    expect(screen.getByText("Runs on pull_request events")).toBeInTheDocument();
    expect(screen.queryByText(/CircleCI|Jenkins|Generic CLI/)).toBeNull();
    await waitFor(() => expect(screen.getByLabelText(/Target repository/)).toHaveValue("acme/web"));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    cleanup();

    renderWizard({ ...AGENT, provider: "openai" });
    expect(screen.getByRole("alert")).toHaveTextContent("Only agents using the OpenRouter provider can run in CI");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("Preview + Configure: file panes, trigger chips, regenerated workflow, static secrets, no GitHub calls", async () => {
    renderWizard();
    await waitFor(() => expect(screen.getByLabelText(/Target repository/)).toHaveValue("acme/web"));
    click("Continue");

    // AC-21 / AC-25: files list; workflow editable, skill read-only, runner shows its version.
    expect(await screen.findByText("FILES TO CREATE")).toBeInTheDocument();
    expect(previewCalls()[0]!.body).toEqual({
      repo: "acme/web",
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
    });
    fireEvent.click(screen.getByRole("button", { name: ".github/workflows/devdigest-review-security-reviewer.yml" }));
    expect(screen.getByText("editable")).toBeInTheDocument();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("[opened, synchronize]");
    fireEvent.click(screen.getByRole("button", { name: ".devdigest/skills/injection-guard.md" }));
    expect(screen.getByText("read-only")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: ".devdigest/runner/index.js" }));
    expect(screen.getByText("version abc123def456")).toBeInTheDocument();

    // AC-35 / AC-41 / AC-39 / AC-42.
    click("Continue");
    expect(screen.getByLabelText("pull_request:opened")).toBeChecked();
    expect(screen.getByLabelText("pull_request:synchronize")).toBeChecked();
    expect(screen.getByLabelText("pull_request:reopened")).not.toBeChecked();
    expect(screen.getByLabelText(/GitHub review/)).toBeChecked();
    expect(screen.getByLabelText(/PR comment/)).not.toBeChecked();
    expect(screen.getByLabelText(/None \(exit code only\)/)).not.toBeChecked();
    expect(screen.getByText("OPENROUTER_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("Your OpenRouter key — same BYO key from L06")).toBeInTheDocument();
    expect(screen.getByText("GITHUB_TOKEN")).toBeInTheDocument();
    expect(screen.getByText("Auto-provided by Actions")).toBeInTheDocument();
    expect(screen.getByText(/Add these to your repo’s Actions secrets/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(/To block merges: set Fail CI on \(CI tab\)/);
    expect(screen.getByText(/No GitHub App needed\./)).toBeInTheDocument();

    // AC-37: toggling reopened asks for a new preview that includes it.
    fireEvent.click(screen.getByLabelText("pull_request:reopened"));
    await waitFor(() => expect(previewCalls()).toHaveLength(2));
    expect(previewCalls()[1]!.body?.triggers).toEqual(["opened", "synchronize", "reopened"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    click("Back");
    fireEvent.click(await screen.findByRole("button", { name: ".github/workflows/devdigest-review-security-reviewer.yml" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("reopened");

    // The wizard only talks to the DevDigest API (the secrets checklist is static).
    expect(new Set(calls.map((c) => c.path))).toEqual(new Set(["/repos", "/agents/a1/ci/preview"]));
  });

  it("Install as PR sends the edited workflow and shows the PR link + secret reminder", async () => {
    renderWizard();
    await waitFor(() => expect(screen.getByLabelText(/Target repository/)).toHaveValue("acme/web"));
    click("Continue");
    fireEvent.click(await screen.findByRole("button", { name: /\.github\/workflows/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "name: edited" } });
    click("Continue");
    click("Continue");

    // AC-44: both options, PR text names the repo and the file count.
    expect(screen.getByLabelText(/Open a PR with these files/)).toBeChecked();
    expect(screen.getByLabelText(/Copy files as a zip/)).not.toBeChecked();
    expect(screen.getByRole("dialog")).toHaveTextContent(/in acme\/web titled “Add DevDigest CI review” with the 4 generated files/);
    expect(screen.getByRole("link", { name: "GitHub Action setup docs" })).toBeInTheDocument();

    click("Install");
    const link = await screen.findByRole("link", { name: "View pull request" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/web/pull/7");
    expect(screen.getByText(/Add OPENROUTER_API_KEY to the repo’s Actions secrets/)).toBeInTheDocument();
    const exportCall = calls.find((c) => c.path === "/agents/a1/export-ci")!;
    expect(exportCall.body).toMatchObject({
      repo: "acme/web",
      action: "open_pr",
      workflow_override: "name: edited",
      post_as: "github_review",
    });
  });

  it("shows the GitHub reason when the PR fails and falls back to the zip download", async () => {
    exportResponse = () => json({ error: { code: "external_service_error", message: "Resource not accessible by PAT" } }, 502);
    renderWizard();
    await waitFor(() => expect(screen.getByLabelText(/Target repository/)).toHaveValue("acme/web"));
    click("Continue");
    await screen.findByText("FILES TO CREATE");
    click("Continue");
    click("Continue");
    click("Install");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t open the PR: Resource not accessible by PAT");
    fireEvent.click(within(alert).getByRole("button", { name: "Copy files as a zip instead" }));
    expect(screen.getByLabelText(/Copy files as a zip/)).toBeChecked();
    expect(screen.queryByRole("alert")).toBeNull();

    click("Install");
    expect(await screen.findByText("Zip downloaded")).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.path === "/agents/a1/export-ci").map((c) => c.body?.action)).toEqual(["open_pr", "zip"]);
    expect(screen.queryByRole("link", { name: "View pull request" })).toBeNull();
  });
});
