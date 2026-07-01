"use client";

import React from "react";
import { createPortal } from "react-dom";

/**
 * Hover-triggered popover. The card renders in a body portal at fixed
 * coordinates measured from the trigger (or an explicit `anchorRef`), so it is
 * never clipped by a table / row that has `overflow: hidden`. A short close
 * delay lets the pointer travel from the trigger into the card (e.g. to click a
 * link inside it).
 *
 * - `block`: the trigger fills its container (a `div`, not an inline `span`) so
 *   an entire row can be the hover area. No plaque highlight in this mode.
 * - `anchorRef`: position the card under this element instead of the whole
 *   trigger — e.g. hover anywhere on a row, but open under its findings badges.
 */
export function HoverCard({
  trigger,
  children,
  width = 360,
  block = false,
  anchorRef,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  block?: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const wrapperRef = React.useRef<HTMLElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const openAt = () => {
    cancelClose();
    const el = anchorRef?.current ?? wrapperRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    setPos({ top: r.bottom + 6, left });
    setOpen(true);
  };

  React.useEffect(() => () => cancelClose(), []);
  // A hover preview shouldn't trail a stale position — close when the PAGE
  // scrolls. But ignore scrolls that originate inside the card itself, or the
  // card could never be scrolled (the wheel event would instantly close it).
  React.useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (cardRef.current && target && cardRef.current.contains(target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const setWrapper = (el: HTMLElement | null) => {
    wrapperRef.current = el;
  };

  const card =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={cardRef}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 12,
              boxShadow: "var(--shadow-modal)",
              zIndex: 1000,
              animation: "ddpop .12s ease",
              overflow: "hidden",
            }}
          >
            {children}
          </div>,
          document.body,
        )
      : null;

  if (block) {
    return (
      <>
        <div
          ref={setWrapper}
          onMouseEnter={openAt}
          onMouseLeave={scheduleClose}
          style={{ display: "block", width: "100%", cursor: "help" }}
        >
          {trigger}
        </div>
        {card}
      </>
    );
  }

  return (
    <>
      <span
        ref={setWrapper}
        onMouseEnter={openAt}
        onMouseLeave={scheduleClose}
        style={{
          display: "inline-flex",
          alignItems: "center",
          cursor: "help",
          padding: "2px 6px",
          borderRadius: 7,
          // Slightly lighter plaque while hovering, signalling the trigger.
          background: open ? "var(--bg-hover)" : "transparent",
          transition: "background .12s ease",
        }}
      >
        {trigger}
      </span>
      {card}
    </>
  );
}
