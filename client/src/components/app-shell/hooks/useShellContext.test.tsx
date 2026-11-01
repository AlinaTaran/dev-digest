import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import shell from "../../../../messages/en/shell.json";

const push = vi.fn();
const mutate = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/repos/r1/pulls",
  useRouter: () => ({ push }),
}));
vi.mock("../../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../../lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    repos: [{ id: "r1", full_name: "acme/one", default_branch: "main", last_polled_at: null }],
    activeRepo: { id: "r1", full_name: "acme/one", default_branch: "main", last_polled_at: null },
    setRepoId: vi.fn(),
  }),
}));
vi.mock("../../../lib/hooks", () => ({
  usePulls: () => ({ data: [] }),
  useDeleteRepo: () => ({ mutate }),
}));

import { useShellContext } from "./useShellContext";

afterEach(() => {
  cleanup();
  push.mockClear();
  mutate.mockClear();
  vi.unstubAllGlobals();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{ shell }}>
    {children}
  </NextIntlClientProvider>
);

describe("useShellContext", () => {
  it("routes add-repo and delete-last-repo to /repos/new", () => {
    vi.stubGlobal("confirm", () => true);
    mutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    const { result } = renderHook(() => useShellContext({ onOpenCommandPalette: vi.fn() }), { wrapper });

    result.current.onAddRepo?.();
    expect(push).toHaveBeenLastCalledWith("/repos/new");

    push.mockClear();
    result.current.onRemoveRepo?.("r1");
    expect(push).toHaveBeenCalledWith("/repos/new");
  });
});
