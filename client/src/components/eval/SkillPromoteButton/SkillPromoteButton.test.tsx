import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EvalIntl } from "../test-kit";
import { suiteRun } from "../fixtures";
import { SkillPromoteButton } from "./SkillPromoteButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const withBody = (n: number, body: string) =>
  suiteRun({ n, owner_kind: "skill", owner_id: "s1", config_snapshot: { ...suiteRun().config_snapshot, skill_body: body } });
const older = withBody(1, "old body");
const newer = withBody(2, "new body");

const renderIt = (body: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EvalIntl>
        <SkillPromoteButton skill={{ id: "s1", body }} a={older} b={newer} />
      </EvalIntl>
    </QueryClientProvider>,
  );

describe("SkillPromoteButton", () => {
  it("is absent when the newer body equals the current skill body", () => {
    renderIt("new body");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("applies the newer skill_body via PUT /skills/:id and confirms", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ id: "s1" });
    renderIt("current body");
    fireEvent.click(screen.getByRole("button", { name: "Promote v2" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Promoted v2"));
    expect(put).toHaveBeenCalledWith("/skills/s1", { body: "new body" });
  });
});
