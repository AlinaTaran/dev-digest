import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, getDefaultNormalizer } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

// The imported body is multi-line — the default normalizer collapses
// newlines, which breaks an exact match.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };

const importMutateAsync = vi.fn();
const createMutateAsync = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkill: () => ({ mutateAsync: importMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(() => {
  cleanup();
  importMutateAsync.mockClear();
  createMutateAsync.mockClear();
  push.mockClear();
});

const PREVIEW = {
  name: "pr-quality-rubric",
  description: "Checks PR quality basics",
  type: "rubric" as const,
  body: "# Rubric\nEvery PR needs a description.",
  source: "extracted" as const,
  ignored: ["scripts/run.sh", "notes.txt"],
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

async function selectFile(filename = "SKILL.zip") {
  const file = new File(["dummy contents"], filename, { type: "application/octet-stream" });
  const input = screen.getByTestId("skill-file-input");
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByDisplayValue(PREVIEW.name)).toBeInTheDocument());
}

describe("ImportSkillDrawer", () => {
  it("shows the preview + ignored file list once a file is selected", async () => {
    importMutateAsync.mockResolvedValue(PREVIEW);
    renderWithIntl(<ImportSkillDrawer onClose={vi.fn()} />);

    await selectFile();

    expect(importMutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue(PREVIEW.description)).toBeInTheDocument();
    expect(screen.getByDisplayValue(PREVIEW.body, exact)).toBeInTheDocument();
    expect(screen.getByText("scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
  });

  it("creates the skill as extracted + disabled on confirm", async () => {
    importMutateAsync.mockResolvedValue(PREVIEW);
    createMutateAsync.mockResolvedValue({ id: "sk-new", ...PREVIEW, enabled: false, version: 1 });
    const onClose = vi.fn();
    renderWithIntl(<ImportSkillDrawer onClose={onClose} />);

    await selectFile();
    fireEvent.click(screen.getByText("Add skill"));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: PREVIEW.name,
        source: "extracted",
        enabled: false,
      }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk-new?tab=config");
  });
});
