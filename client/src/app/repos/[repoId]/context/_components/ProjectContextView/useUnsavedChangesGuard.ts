/* Guards unsaved edits against leaving the page.
   - Hard unloads (reload, close tab, external link): native `beforeunload` prompt.
   - In-app <Link> clicks (App Router soft navigation never fires `beforeunload`):
     a capture-phase document click listener asks `window.confirm` and cancels the
     click when declined, before Next's Link handler runs.
   Known limitation: browser back/forward (`popstate`) cannot be cancelled without
   history hacks, so it is intentionally not intercepted. */
"use client";

import React from "react";

function isModifiedClick(e: MouseEvent): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/** True when clicking this anchor would navigate to a different in-app page. */
function leavesPage(a: HTMLAnchorElement): boolean {
  if (a.hasAttribute("download")) return false;
  if (a.target && a.target !== "_self") return false;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false; // beforeunload covers external
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

export function useUnsavedChangesGuard(dirty: boolean, message: string) {
  React.useEffect(() => {
    if (!dirty) return;

    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || isModifiedClick(e)) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement) || !leavesPage(a)) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
