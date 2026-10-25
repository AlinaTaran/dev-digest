import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const pathnameMock = vi.fn<() => string>();
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));
vi.mock("./hooks", () => ({
  useRepos: () => ({
    data: [
      { id: "r1", full_name: "acme/one" },
      { id: "r2", full_name: "acme/two" },
    ],
    isSuccess: true,
  }),
}));

import { RepoProvider, repoIdFromPath, useActiveRepo } from "./repo-context";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function Probe() {
  const { repoId, activeRepo } = useActiveRepo();
  return <p>{`${repoId}|${activeRepo?.full_name}`}</p>;
}

describe("repoIdFromPath", () => {
  it("treats /repos/new as no repo and keeps real ids", () => {
    expect(repoIdFromPath("/repos/new")).toBeNull();
    expect(repoIdFromPath("/repos/new/")).toBeNull();
    expect(repoIdFromPath("/repos/abc/pulls")).toBe("abc");
    expect(repoIdFromPath("/onboarding")).toBeNull();
  });
});

describe("RepoProvider at /repos/new", () => {
  it("falls back to the stored repo instead of treating 'new' as an id", async () => {
    pathnameMock.mockReturnValue("/repos/new");
    localStorage.setItem("dd-repo", "r2");
    render(
      <RepoProvider>
        <Probe />
      </RepoProvider>,
    );
    await waitFor(() => expect(screen.getByText("r2|acme/two")).toBeInTheDocument());
  });
});
