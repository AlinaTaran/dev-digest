"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "../styles";

export function ReviewFocus({
  items,
  onOpen,
}: {
  items: ReviewFocusItem[];
  onOpen: (file: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.section}>
      <SectionLabel icon="Eye" right={<Badge>{items.length}</Badge>}>
        {t("block.reviewFocus")}
      </SectionLabel>
      {items.length === 0 ? (
        <span style={s.emptyLine}>{t("prBrief.noFocus")}</span>
      ) : (
        <ol data-brief-section="review-focus" style={s.focusList}>
          {items.map((item, i) => (
            <li key={`${i}:${item.file}:${item.line}`}>
              <button
                type="button"
                style={s.focusBtn}
                aria-label={t("prBrief.focusItem", { file: item.file, line: item.line, reason: item.reason })}
                onClick={() => onOpen(item.file, item.line)}
              >
                <span style={s.mono}>
                  {item.file}:{item.line}
                </span>
                {" — "}
                {item.reason}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
