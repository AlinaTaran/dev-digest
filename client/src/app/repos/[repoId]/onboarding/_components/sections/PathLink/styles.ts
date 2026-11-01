import type React from "react";

export const s: Record<string, React.CSSProperties> = {
  link: {
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    color: "var(--accent-text)",
    textDecoration: "none",
  },
};
