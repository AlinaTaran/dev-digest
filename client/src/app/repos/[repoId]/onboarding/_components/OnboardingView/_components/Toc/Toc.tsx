import React from "react";
import { useTranslations } from "next-intl";
import { ONBOARDING_SECTIONS } from "@/lib/onboarding-sections";

const list: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };
const itemBase: React.CSSProperties = {
  padding: "6px 12px", fontSize: 13.5, color: "var(--text-secondary)", textDecoration: "none",
  borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: "transparent",
};
const itemActive: React.CSSProperties = { ...itemBase, color: "var(--text-primary)", borderLeftColor: "var(--accent)", fontWeight: 600 };

export interface TocProps {
  active: string;
  onSelect: (anchor: string) => void;
}

export function Toc({ active, onSelect }: TocProps) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("toc.label")}>
      <div style={list}>
        {ONBOARDING_SECTIONS.map((m) => (
          <a
            key={m.anchor}
            href={`#${m.anchor}`}
            aria-current={active === m.anchor ? "location" : undefined}
            style={active === m.anchor ? itemActive : itemBase}
            onClick={(e) => {
              e.preventDefault();
              onSelect(m.anchor);
            }}
          >
            {t(m.titleKey)}
          </a>
        ))}
      </div>
    </nav>
  );
}
