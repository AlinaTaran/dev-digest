import { describe, expect, it } from "vitest";
import { githubBlobUrl, githubTreeUrl } from "./github-urls";

describe("github-urls", () => {
  it("encodes blob and tree paths per segment, keeping separators", () => {
    expect(githubBlobUrl("acme/api", "abc123", "src/my file.ts")).toBe(
      "https://github.com/acme/api/blob/abc123/src/my%20file.ts",
    );
    expect(githubBlobUrl("acme/api", "abc123", "docs/привіт/файл.md")).toBe(
      `https://github.com/acme/api/blob/abc123/docs/${encodeURIComponent("привіт")}/${encodeURIComponent("файл.md")}`,
    );
    expect(githubTreeUrl("acme/api", "abc123", "src/my dir/")).toBe(
      "https://github.com/acme/api/tree/abc123/src/my%20dir",
    );
    expect(githubTreeUrl("acme/api", "abc123", "каталог")).toBe(
      `https://github.com/acme/api/tree/abc123/${encodeURIComponent("каталог")}`,
    );
  });

  it("links to the tree root for an empty directory", () => {
    expect(githubTreeUrl("acme/api", "abc123", "")).toBe("https://github.com/acme/api/tree/abc123");
    expect(githubTreeUrl("acme/api", "abc123", "/")).toBe("https://github.com/acme/api/tree/abc123");
  });
});
