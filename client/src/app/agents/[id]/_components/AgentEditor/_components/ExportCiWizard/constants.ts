import type { CiPostAs, CiTriggerEvent } from "@devdigest/shared";

export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export const LAST_STEP = STEP_KEYS.length - 1;

/** Only agents on this provider can run in CI (the runner uses the BYO OpenRouter key). */
export const CI_PROVIDER = "openrouter";
export const SECRET_KEY = "OPENROUTER_API_KEY";
export const DOCS_URL = "https://docs.github.com/en/actions/writing-workflows";

export const TRIGGERS: readonly CiTriggerEvent[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTriggerEvent[] = ["opened", "synchronize"];
export const POST_AS_VALUES: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];
export const DEFAULT_POST_AS: CiPostAs = "github_review";
