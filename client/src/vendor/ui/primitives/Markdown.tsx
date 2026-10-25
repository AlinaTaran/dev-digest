import React, { createContext, useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Allow only http(s), mailto, anchors and relative URLs — anything else
    (javascript:, data:, vbscript:…) becomes an empty, inert href. */
export function safeUrl(url: string): string {
  const u = url.trim();
  if (u === "" || u.startsWith("#") || u.startsWith("/") || u.startsWith("./") || u.startsWith("../")) return u;
  // Browsers strip tabs/newlines/control chars inside a URL, so "java\tscript:" is still a scheme.
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(u.replace(/[\u0000-\u0020]/g, ""));
  if (!m) return u; // no scheme → relative
  return ["http", "https", "mailto"].includes(m[1]!.toLowerCase()) ? u : "";
}

/** True while rendering the children of a fenced/indented code block (`pre`). */
const InPreContext = createContext(false);

const heading = (size: number, weight: number, margin: string): React.CSSProperties => ({
  fontSize: size,
  fontWeight: weight,
  lineHeight: 1.3,
  color: "var(--text-primary)",
  margin,
});

const list: React.CSSProperties = { margin: "0 0 10px", paddingLeft: 20 };

function Code({ children }: { children?: React.ReactNode }) {
  const inPre = useContext(InPreContext);
  if (inPre) return <code className="mono">{children}</code>;
  return (
    <code
      className="mono"
      style={{
        fontSize: "0.92em",
        padding: "1px 6px",
        borderRadius: 4,
        background: "var(--bg-hover)",
        color: "var(--accent-text)",
      }}
    >
      {children}
    </code>
  );
}

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          h1: ({ children }) => <h1 style={heading(22, 650, "0 0 16px")}>{children}</h1>,
          h2: ({ children }) => <h2 style={heading(17, 600, "20px 0 8px")}>{children}</h2>,
          h3: ({ children }) => <h3 style={heading(15, 600, "16px 0 6px")}>{children}</h3>,
          h4: ({ children }) => <h4 style={heading(14, 600, "14px 0 4px")}>{children}</h4>,
          h5: ({ children }) => <h5 style={heading(13, 600, "12px 0 4px")}>{children}</h5>,
          h6: ({ children }) => <h6 style={heading(13, 600, "12px 0 4px")}>{children}</h6>,
          ul: ({ children }) => <ul style={{ ...list, listStyle: "disc" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ ...list, listStyle: "decimal" }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "4px 0" }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 10px",
                padding: "2px 0 2px 12px",
                borderLeft: "3px solid var(--border-strong)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" }} />
          ),
          pre: ({ children }) => (
            <pre
              className="mono"
              style={{
                margin: "0 0 12px",
                padding: "12px 14px",
                borderRadius: 6,
                background: "var(--bg-hover)",
                color: "var(--text-primary)",
                fontSize: "0.9em",
                lineHeight: 1.5,
                overflowX: "auto",
              }}
            >
              <InPreContext.Provider value={true}>{children}</InPreContext.Provider>
            </pre>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>{children}</table>
            </div>
          ),
          th: ({ children, style }) => (
            <th
              style={{
                ...style,
                padding: "6px 10px",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                fontWeight: 600,
                textAlign: style?.textAlign ?? "left",
              }}
            >
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td style={{ ...style, padding: "6px 10px", border: "1px solid var(--border)" }}>{children}</td>
          ),
          code: ({ children }) => <Code>{children}</Code>,
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
