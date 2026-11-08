import type { CSSProperties } from "react";
import type { WordDiffKind } from "@/lib/eval/word-diff";

export const s = {
  box: {
    maxHeight: 320,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--code-bg)",
    padding: "14px 16px",
    fontSize: 12.5,
    lineHeight: 1.75,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  token: (kind: WordDiffKind): CSSProperties => ({
    background: kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent",
    color: kind === "same" ? "var(--text-secondary)" : "var(--text-primary)",
    textDecoration: kind === "del" ? "line-through" : "none",
    textDecorationColor: "var(--crit)",
  }),
};
