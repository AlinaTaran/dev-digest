/* Word-level diff of two prompts (old = red + strikethrough, new = green). Text is always rendered
   as plain text nodes (AC-71). Shared by the agent-prompt and skill-body compare. */
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { wordDiff } from "@/lib/eval/word-diff";
import { s } from "./styles";

export function PromptDiffView({ before, after, label }: { before: string; after: string; label?: string }) {
  const t = useTranslations("eval");
  const tokens = useMemo(() => wordDiff(before, after), [before, after]);
  return (
    <div className="mono" style={s.box} role="region" aria-label={label ?? t("compareModal.systemPromptDiff")} tabIndex={0}>
      {tokens.map((tk, i) => (
        <span key={i} style={s.token(tk.kind)} data-kind={tk.kind}>
          {tk.text}
        </span>
      ))}
    </div>
  );
}
