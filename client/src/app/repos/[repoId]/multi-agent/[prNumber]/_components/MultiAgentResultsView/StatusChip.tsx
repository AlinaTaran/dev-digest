/* Run status chip: colored dot (pulsing while running) + sentence-case label. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { statusColor } from "./helpers";
import { s } from "./styles";

export function StatusChip({ status }: { status: AgentColumn["status"] }) {
  const t = useTranslations("multiAgentResults");
  const color = statusColor(status);
  return (
    <span style={{ ...s.statusChip, color }} data-status={status}>
      {status === "done" ? (
        <Icon.Check size={12} aria-hidden />
      ) : (
        <span
          aria-hidden
          style={{
            ...s.dot,
            background: color,
            animation: status === "running" ? "ddpulse 1.2s ease-in-out infinite" : undefined,
          }}
        />
      )}
      {t(`status.${status}`)}
    </span>
  );
}
