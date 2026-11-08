import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvalIntl } from "../test-kit";
import { PromptDiffView } from "./PromptDiffView";

afterEach(cleanup);

describe("PromptDiffView", () => {
  it("marks removed words and added words and escapes markup", () => {
    render(
      <EvalIntl>
        <PromptDiffView before="keep <b>old</b> end" after="keep new end" />
      </EvalIntl>,
    );
    expect(screen.getByText("<b>old</b>")).toHaveAttribute("data-kind", "del");
    expect(screen.getByText("new")).toHaveAttribute("data-kind", "add");
    expect(document.querySelector("b")).toBeNull();
  });
});
