import React from "react";

/** REAL controlled textarea with a synced line-number gutter — a lightweight
    "code editor" look (no syntax highlighting). Soft-wrap is disabled so each
    logical line is exactly one visual row, keeping the gutter numbers aligned;
    long lines scroll horizontally. Shares Textarea's box + type metrics so the
    numbers line up with the text. */
export function CodeTextarea({
  value,
  onChange,
  placeholder,
  rows = 16,
  mono = true,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lineCount = value.length ? value.split("\n").length : 1;

  // Keep the gutter's vertical scroll locked to the textarea's.
  const syncScroll = () => {
    if (gutterRef.current && taRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
        borderRadius: 7,
        overflow: "hidden",
      }}
    >
      <div
        ref={gutterRef}
        aria-hidden
        className={mono ? "mono" : undefined}
        style={{
          flexShrink: 0,
          width: 46,
          overflow: "hidden",
          textAlign: "right",
          padding: "10px 10px 10px 0",
          borderRight: "1px solid var(--border)",
          background: "var(--code-bg)",
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.55,
          userSelect: "none",
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={taRef}
        className={mono ? "mono" : undefined}
        value={value}
        rows={rows}
        placeholder={placeholder}
        wrap="off"
        onScroll={syncScroll}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          resize: "vertical",
          padding: "10px 12px",
          border: "none",
          background: "transparent",
          color: "var(--text-primary)",
          fontSize: 14,
          lineHeight: 1.55,
          outline: "none",
          whiteSpace: "pre",
          overflowX: "auto",
        }}
      />
    </div>
  );
}
