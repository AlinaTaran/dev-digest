import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { RepoNotFound } from "./RepoNotFound";

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("RepoNotFound", () => {
  it("sends the CTA to /repos/new", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <RepoNotFound />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: common.repoNotFound.cta }));
    expect(push).toHaveBeenCalledWith("/repos/new");
  });
});
