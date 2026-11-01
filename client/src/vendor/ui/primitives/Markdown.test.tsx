import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Markdown, safeUrl } from "./Markdown";

afterEach(cleanup);

describe("Markdown hardening", () => {
  it("does not render raw HTML such as <script>", () => {
    const { container } = render(<Markdown>{"# Title\n\n<script>window.__pwn = 1</script>\n\n<b>raw</b>"}</Markdown>);
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("strips executable link schemes but keeps safe ones", () => {
    render(
      <Markdown>
        {"[bad](javascript:alert(1)) [bad2](JaVaScRiPt:alert(1)) [data](data:text/html,x) [ok](https://example.com) [mail](mailto:a@b.co) [rel](./x.md) [anchor](#top)"}
      </Markdown>,
    );
    expect(screen.getByText("bad").getAttribute("href") ?? "").toBe("");
    expect(screen.getByText("bad2").getAttribute("href") ?? "").toBe("");
    expect(screen.getByText("data").getAttribute("href") ?? "").toBe("");
    expect(screen.getByText("ok")).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("mail")).toHaveAttribute("href", "mailto:a@b.co");
    expect(screen.getByText("rel")).toHaveAttribute("href", "./x.md");
    expect(screen.getByText("anchor")).toHaveAttribute("href", "#top");
  });

  it("safeUrl rejects whitespace-obfuscated schemes", () => {
    expect(safeUrl("java\tscript:alert(1)")).toBe("");
    expect(safeUrl(" vbscript:x")).toBe("");
  });

  it("styles full documents: headings, lists, code blocks, inline code", () => {
    const { container } = render(
      <Markdown>{"# Role\n\n## Rules\n\n- one\n- two\n\n1. first\n\nuse `x` here\n\n```\nconst a = 1;\n```"}</Markdown>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Role" }).tagName).toBe("H1");
    expect(screen.getByRole("heading", { level: 2, name: "Rules" }).tagName).toBe("H2");
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    // block code is not styled as an inline pill
    expect(pre!.querySelector("code")!.style.padding).toBe("");
    expect(screen.getByText("x").style.padding).not.toBe("");
  });
});
