#!/usr/bin/env bash
# PreToolUse gate for the `pr-self-review` skill.
#
# Registered in .claude/settings.json against Bash(git push:*) and
# Bash(gh pr create:*). It blocks the GitHub operation unless a FRESH, PASSING
# self-review report exists for the current branch diff.
#
# Decision logic:
#   - PR_SELF_REVIEW_BYPASS=1 set        -> allow (bypass logged into the report)
#   - report missing                     -> deny  (run the skill first)
#   - report.diffHash != current diff    -> deny  (diff changed since review — stale)
#   - report.verdict == "block"          -> deny  (unwaived CRITICAL findings)
#   - otherwise (verdict == "pass")      -> allow
#
# The diffHash algorithm below MUST stay byte-for-byte identical to the one the
# skill uses when it writes the report (see SKILL.md "diffHash" section).

set -euo pipefail

# Read the PreToolUse payload from stdin and self-scope to the GitHub commands we
# gate. This makes the hook correct regardless of the settings.json matcher
# granularity: if the matcher is broad ("Bash"), we early-exit on unrelated
# commands; if it is already narrow, this is a harmless no-op.
STDIN_JSON="$(cat 2>/dev/null || true)"
if [ -n "$STDIN_JSON" ]; then
  CMD="$(printf '%s' "$STDIN_JSON" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
  if [ -n "$CMD" ]; then
    case "$CMD" in
      *"git push"*|*"gh pr create"*) : ;;   # gate these
      *) exit 0 ;;                           # everything else: allow, do nothing
    esac
  fi
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REPORT="$REPO_ROOT/.claude/pr-self-review-report.json"

emit_deny() {
  # $1 = reason shown to the agent
  jq -cn --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

allow() { exit 0; }  # no output -> defer to normal permission flow

# --- canonical diffHash (keep in sync with SKILL.md) -------------------------
current_diff_hash() {
  local base
  base="$(git merge-base main HEAD 2>/dev/null || git rev-parse HEAD)"
  { git diff "$base"...HEAD 2>/dev/null; git diff HEAD 2>/dev/null; } \
    | shasum -a 256 | awk '{print $1}'
}

# --- 1. explicit bypass ------------------------------------------------------
if [ "${PR_SELF_REVIEW_BYPASS:-0}" = "1" ]; then
  # Record the bypass in the report (best-effort) so it is auditable.
  if [ -f "$REPORT" ]; then
    tmp="$(mktemp)"
    jq '.bypassed = true' "$REPORT" > "$tmp" 2>/dev/null && mv "$tmp" "$REPORT" || rm -f "$tmp"
  fi
  allow
fi

# --- 2. report must exist ----------------------------------------------------
if [ ! -f "$REPORT" ]; then
  emit_deny "No pr-self-review report found. Run the \`pr-self-review\` skill on the current branch diff before pushing / opening a PR. To override in an emergency: PR_SELF_REVIEW_BYPASS=1."
fi

# --- 3. report must be fresh -------------------------------------------------
reported_hash="$(jq -r '.diffHash // ""' "$REPORT")"
actual_hash="$(current_diff_hash)"
if [ "$reported_hash" != "$actual_hash" ]; then
  emit_deny "The diff changed since the last pr-self-review (report is stale). Re-run the \`pr-self-review\` skill, then push again. Override: PR_SELF_REVIEW_BYPASS=1."
fi

# --- 4. verdict must be pass -------------------------------------------------
verdict="$(jq -r '.verdict // "block"' "$REPORT")"
if [ "$verdict" != "pass" ]; then
  n="$(jq -r '.criticalCount // 0' "$REPORT")"
  emit_deny "pr-self-review found $n unwaived CRITICAL finding(s). Fix them (or add a justified waiver to .claude/pr-self-review-waivers.json) and re-run the skill. Override: PR_SELF_REVIEW_BYPASS=1."
fi

allow
