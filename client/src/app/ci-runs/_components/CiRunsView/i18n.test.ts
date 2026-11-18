import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ci from "../../../../../messages/en/ci.json";
import { KNOWN_STATUSES, KNOWN_VERDICTS } from "./helpers";

const ROOT = join(process.cwd(), "src/app");
const SOURCES = [
  "ci-runs/_components/CiRunsView",
  "agents/[id]/_components/AgentEditor/_components/CiTab",
  "agents/[id]/_components/AgentEditor/_components/ExportCiWizard",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    .map((f) => readFileSync(join(ROOT, dir, f), "utf8"));
}

function lookup(path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], ci);
}

describe("ci i18n keys (NFR-8)", () => {
  const src = SOURCES.flatMap(sourceFiles).join("\n");

  it("every static t('…') key used by the CI UI exists in ci.json", () => {
    const keys = [...src.matchAll(/\bt\("([\w.]+)"/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(30);
    expect(keys.filter((k) => typeof lookup(k) !== "string")).toEqual([]);
  });

  it("every dynamic t(`prefix.${…}`) key has a message group, with the known statuses/verdicts covered", () => {
    const prefixes = [...src.matchAll(/\bt\(`([\w.]+)\.\$\{/g)].map((m) => m[1]!);
    expect(prefixes.length).toBeGreaterThan(5);
    expect(prefixes.filter((p) => typeof lookup(p) !== "object")).toEqual([]);
    for (const k of KNOWN_STATUSES) {
      expect(lookup(`runs.status.${k}`)).toEqual(expect.any(String));
      expect(lookup(`ciTab.status.${k}`)).toEqual(expect.any(String));
    }
    for (const k of KNOWN_VERDICTS) {
      expect(lookup(`runs.verdict.${k}`)).toEqual(expect.any(String));
      expect(lookup(`ciTab.verdict.${k}`)).toEqual(expect.any(String));
    }
  });

  it("does not use the stubbed GitHub-App block-merge copy", () => {
    expect(src).not.toContain("blockMergeDesc");
    expect(JSON.stringify(ci)).not.toContain("GitHub App —");
  });
});
