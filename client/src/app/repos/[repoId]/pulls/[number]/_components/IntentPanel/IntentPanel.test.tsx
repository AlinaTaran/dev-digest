import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import brief from "../../../../../../../../messages/en/brief.json";
import shell from "../../../../../../../../messages/en/shell.json";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual<object>("@/lib/api")), api: { get, post: vi.fn() } }));

import { IntentPanel } from "./IntentPanel";

afterEach(() => {
  cleanup();
  get.mockReset();
});

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ brief, shell }}
        onError={(e) => {
          throw e;
        }}
      >
        <IntentPanel prId="p1" footer={<p>FOOTER</p>} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("IntentPanel", () => {
  it("renders no risk chips and shows the footer in the loading, data and error states (AC-37)", async () => {
    get.mockReturnValueOnce(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText("FOOTER")).toBeInTheDocument();
    cleanup();

    get.mockResolvedValueOnce({
      intent: "Load config",
      in_scope: ["a"],
      out_of_scope: [],
      risks: [{ kind: "security", title: "Chip title", explanation: "e", severity: "high", file_refs: [] }],
    });
    renderPanel();
    expect(await screen.findByText("Load config")).toBeInTheDocument();
    expect(screen.queryByText("Chip title")).toBeNull();
    expect(screen.queryByText(brief.block.risks)).toBeNull();
    expect(screen.getByText("FOOTER")).toBeInTheDocument();
    cleanup();

    get.mockRejectedValueOnce(new Error("boom"));
    renderPanel();
    expect(await screen.findByText(brief.error.title)).toBeInTheDocument();
    expect(screen.getByText("FOOTER")).toBeInTheDocument();
  });
});
