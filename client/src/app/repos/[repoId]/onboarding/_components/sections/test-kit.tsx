import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";

export const REPO = "acme/payments-api";
export const SHA = "abc123def";

/** Renders with ONLY the `onboarding` namespace, so a missing key throws/logs (NFR-7). */
export function renderWithIntl(ui: React.ReactElement): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}
