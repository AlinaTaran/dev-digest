import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("../lib/hooks", () => ({
  useRepos: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import HomePage from "./page";

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("HomePage", () => {
  it("empty repos list: CTA goes to /repos/new", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(push).toHaveBeenCalledWith("/repos/new");
  });
});
