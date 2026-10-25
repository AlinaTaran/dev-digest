import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../messages/en/settings.json";
import { SettingsProjectContext } from "./SettingsProjectContext";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

let intlErrors: unknown[] = [];

function renderPanel() {
  intlErrors = [];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ settings: messages }} onError={(e) => intlErrors.push(e)}>
        <SettingsProjectContext />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsProjectContext", () => {
  it("falls back to the default glob, saves edits, and shows a server rejection inline", async () => {
    const puts: unknown[] = [];
    let reject = true;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          puts.push(JSON.parse(init.body as string));
          return reject
            ? json({ error: { code: "invalid_project_context_globs", message: "Glob must not contain .." } }, 400)
            : json({ project_context_globs: ["docs/**/*.md"] });
        }
        return json({});
      }),
    );
    renderPanel();

    const input = await screen.findByRole("textbox", { name: "Glob pattern 1" });
    expect(input).toHaveValue("**/{specs,docs,insights}/**/*.md");

    fireEvent.change(input, { target: { value: "../etc/*.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Save globs" }));
    expect(await screen.findByText(/Glob must not contain \.\./)).toBeInTheDocument();
    expect(puts[0]).toEqual({ project_context_globs: ["../etc/*.md"] });
    // draft stays editable after a rejection
    expect(screen.getByRole("textbox", { name: "Glob pattern 1" })).toHaveValue("../etc/*.md");

    reject = false;
    fireEvent.change(screen.getByRole("textbox", { name: "Glob pattern 1" }), { target: { value: "docs/**/*.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Add glob" }));
    fireEvent.click(screen.getByRole("button", { name: "Save globs" })); // blank row is dropped
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toEqual({ project_context_globs: ["docs/**/*.md"] });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    // NFR-9: no MISSING_MESSAGE across the panel's states
    expect(intlErrors).toEqual([]);
  });
});
