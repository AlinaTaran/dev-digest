import React from "react";
import { s } from "./styles";

/** Mono repo path that opens a GitHub URL in a new tab; ellipsis in CSS, full text in `title`. */
export function PathLink({ href, path, label }: { href: string; path: string; label: string }) {
  return (
    <a
      className="mono"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={path}
      aria-label={label}
      style={s.link}
    >
      {path}
    </a>
  );
}
