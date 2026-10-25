import React from "react";
import { Icon, type IconName } from "@devdigest/ui";

const card: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", scrollMarginTop: 16,
};
const head: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 18px", textAlign: "left",
  background: "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer",
};
const iconBox: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center",
  background: "var(--accent-bg)", color: "var(--accent-text)",
};
const titleS: React.CSSProperties = { fontSize: 16, fontWeight: 600, flex: 1 };
const bodyS: React.CSSProperties = { padding: "0 18px 18px" };

export interface SectionCardProps {
  anchor: string;
  title: string;
  icon: IconName;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function SectionCard({ anchor, title, icon, open, onToggle, children }: SectionCardProps) {
  const I = Icon[icon];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  const bodyId = `${anchor}-body`;
  return (
    <section id={anchor} style={card}>
      <button type="button" style={head} aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span style={iconBox}><I size={16} /></span>
        <span style={titleS}>{title}</span>
        <Chevron size={16} />
      </button>
      <div id={bodyId} hidden={!open} style={bodyS}>
        {children}
      </div>
    </section>
  );
}
