import React from "react";

/** Tracks which section anchor is currently in view (the first visible one in page order).
    Guarded: without IntersectionObserver (jsdom, old browsers) it only changes via `setActive`. */
export function useActiveSection(anchors: readonly string[], enabled: boolean) {
  const [active, setActive] = React.useState<string>(anchors[0]!);

  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = anchors.find((a) => visible.has(a));
        if (first) setActive(first);
      },
      { rootMargin: "-10% 0px -60% 0px" },
    );
    for (const a of anchors) {
      const el = document.getElementById(a);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [anchors, enabled]);

  return [active, setActive] as const;
}
