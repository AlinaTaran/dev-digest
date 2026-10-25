import React from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last — only the topmost one reacts to Esc/Tab (nested dialogs must not double-close). */
const openDialogs: HTMLElement[] = [];

/**
 * Dialog a11y shared by Modal and Drawer: Esc closes, Tab is trapped inside, initial focus moves
 * into the dialog (unless a child already took it, e.g. `autoFocus`), focus is restored to the
 * previously focused element on unmount.
 */
export function useDialogA11y(ref: React.RefObject<HTMLElement | null>, onClose?: () => void) {
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    openDialogs.push(el);
    if (!el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== el) return;
      if (e.key === "Escape") {
        if (!closeRef.current) return;
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!el.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = openDialogs.indexOf(el);
      if (i !== -1) openDialogs.splice(i, 1);
      opener?.focus?.();
    };
  }, [ref]);
}
