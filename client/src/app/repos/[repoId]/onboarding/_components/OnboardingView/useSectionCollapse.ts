import React from "react";

/** Per-section collapse state. Everything starts expanded (AC-54); state is a set of collapsed anchors. */
export function useSectionCollapse() {
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());

  const isOpen = React.useCallback((anchor: string) => !collapsed.has(anchor), [collapsed]);
  const toggle = React.useCallback((anchor: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(anchor)) next.add(anchor);
      return next;
    });
  }, []);
  const expand = React.useCallback((anchor: string) => {
    setCollapsed((prev) => {
      if (!prev.has(anchor)) return prev;
      const next = new Set(prev);
      next.delete(anchor);
      return next;
    });
  }, []);

  return { isOpen, toggle, expand };
}
