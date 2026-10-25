import { describe, it, expect, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...args),
  RedirectType: { replace: "replace", push: "push" },
}));

import OnboardingRedirect from "./page";

describe("/onboarding", () => {
  it("replace-redirects to /repos/new", () => {
    OnboardingRedirect();
    expect(redirect).toHaveBeenCalledWith("/repos/new", "replace");
  });
});
