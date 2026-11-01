import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";
import { Drawer } from "./Drawer";

afterEach(cleanup);

const esc = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

describe.each([
  ["Modal", Modal],
  ["Drawer", Drawer],
])("%s a11y", (_name, Dialog) => {
  it("is labelled by its title, moves focus in, wraps Tab at both ends and closes once on Esc", () => {
    const onClose = vi.fn();
    render(
      <>
        <button>opener</button>
        <Dialog title="Hello" onClose={onClose}>
          <input aria-label="field" />
        </Dialog>
      </>,
    );
    const dialog = screen.getByRole("dialog", { name: "Hello" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    // DOM order: Close (header) then field (body)
    const field = screen.getByLabelText("field");
    const close = screen.getByRole("button", { name: "Close" });
    field.focus();
    fireEvent.keyDown(field, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(field).toHaveFocus();

    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("only the topmost of nested dialogs handles Esc", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const ui = (open: boolean) => (
      <Dialog title="Outer" onClose={outer}>
        {open && <Modal title="Inner" onClose={inner} />}
      </Dialog>
    );
    const { rerender } = render(ui(false));
    esc();
    expect(outer).toHaveBeenCalledTimes(1);
    rerender(ui(true));
    esc();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the previously focused element after closing", () => {
    const ui = (open: boolean) => (
      <>
        <button>opener</button>
        {open && <Dialog title="T" onClose={() => {}} />}
      </>
    );
    const { rerender } = render(ui(false));
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    rerender(ui(true));
    expect(opener).not.toHaveFocus();
    rerender(ui(false));
    expect(opener).toHaveFocus();
  });
});
