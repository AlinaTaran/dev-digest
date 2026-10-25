import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "../test-kit";
import { RunLocallySection } from "./RunLocallySection";

const section = {
  kind: "run_locally" as const,
  empty_reason: null,
  steps: [
    { command: "pnpm install", source_path: "package.json", note: null },
    { command: "<b>pnpm dev</b>", source_path: "package.json", note: "dev → next dev" },
  ],
};

const stubClipboard = (writeText: (s: string) => Promise<void>) =>
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

afterEach(() => vi.restoreAllMocks());

describe("RunLocallySection", () => {
  it("lists numbered commands as text, copies the exact command and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const { container } = renderWithIntl(<RunLocallySection section={section} />);

    expect(screen.getByText(/Check each one before you run it/)).toBeInTheDocument();
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Copy command pnpm install" }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith("pnpm install");
  });

  it("shows an error toast when the clipboard rejects", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    renderWithIntl(<RunLocallySection section={section} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy command pnpm install" }));
    expect(await screen.findByText("Couldn’t copy the command")).toBeInTheDocument();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });
});
