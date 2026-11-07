import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room. Bumped from 240s
    // (2026-11-04): a workflow `trace` case that waits on both a file-read AND a nested subagent
    // dispatch (architecture-reviewer, up to 25 of its own turns) hit the old timeout outright.
    testTimeout: 360_000,
    hookTimeout: 360_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    reporters: ["default", new TrendReporter()],
  },
});
