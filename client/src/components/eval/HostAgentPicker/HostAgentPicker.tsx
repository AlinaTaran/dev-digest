/* Host-agent picker for skill evals: a skill is tested inside one of the agents it is linked to.
   Controlled; the page/server decides the default (`value`). */
"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

export interface HostAgentPickerProps {
  agents: { id: string; name: string }[];
  value: string | null;
  onChange: (agentId: string) => void;
  disabled?: boolean;
}

const selectStyle: CSSProperties = {
  height: 32,
  padding: "0 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elev, var(--bg))",
  color: "var(--text)",
  fontSize: 13,
};
const wrapStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 };

export function HostAgentPicker({ agents, value, onChange, disabled }: HostAgentPickerProps) {
  const t = useTranslations("eval");
  const id = useId();

  if (agents.length === 0) {
    return (
      <span role="note" style={{ fontSize: 13, color: "var(--text-dim)" }}>
        {t("hostAgent.none")}
      </span>
    );
  }

  return (
    <span style={wrapStyle}>
      <label htmlFor={id}>{t("hostAgent.label")}</label>
      <select id={id} style={selectStyle} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {value === null && (
          <option value="" disabled>
            {t("hostAgent.placeholder")}
          </option>
        )}
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </span>
  );
}
