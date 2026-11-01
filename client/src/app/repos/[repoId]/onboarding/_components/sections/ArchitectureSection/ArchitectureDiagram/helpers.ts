import type { OnboardingDiagramNode, OnboardingNodeKind } from "@devdigest/shared";

/** Left-to-right column order of node kinds. */
export const KIND_ORDER: readonly OnboardingNodeKind[] = [
  "client",
  "entrypoint",
  "middleware",
  "module",
  "datastore",
  "external",
];

export const KIND_COLOR: Record<OnboardingNodeKind, string> = {
  client: "var(--accent)",
  entrypoint: "var(--ok)",
  middleware: "var(--warn)",
  module: "var(--text-secondary)",
  datastore: "var(--crit)",
  external: "var(--info)",
};

/** Sized so five columns (~1000px) fit the onboarding card at a scale close to 1. */
export const NODE_W = 132;
export const NODE_H = 48;
/** Column gap: holds a two-line edge label of ~11 chars per line. */
const GAP_X = 88;
/** Rows leave a lane wide enough for an edge that skips a column to pass between nodes. */
const GAP_Y = 24;
const PAD = 14;
const LANE_STEP = 5;

/** Edge labels: 10px text in a pill, wrapped to two lines; the rest is cut with "…" (full text in a tooltip). */
export const LABEL_FONT = 10;
export const LABEL_LINE_H = 11;
const LABEL_CHAR_W = 5.6;
const LABEL_PAD_X = 4;
const LABEL_PAD_Y = 2;
const LABEL_MAX_LINES = 2;
export const LABEL_LINE_CHARS = Math.floor((GAP_X - 12 - LABEL_PAD_X * 2) / LABEL_CHAR_W);

export interface PlacedNode {
  node: OnboardingDiagramNode;
  x: number;
  y: number;
}

export interface Layout {
  width: number;
  height: number;
  placed: PlacedNode[];
  /** Rows in the tallest column. */
  rows: number;
  /** Kinds actually present, in column order. */
  kinds: OnboardingNodeKind[];
}

export function layoutNodes(nodes: OnboardingDiagramNode[]): Layout {
  const kinds = KIND_ORDER.filter((k) => nodes.some((n) => n.kind === k));
  const rows = new Map<OnboardingNodeKind, number>();
  const placed = nodes.map((node) => {
    const col = kinds.indexOf(node.kind);
    const row = rows.get(node.kind) ?? 0;
    rows.set(node.kind, row + 1);
    return {
      node,
      x: PAD + col * (NODE_W + GAP_X),
      y: PAD + row * (NODE_H + GAP_Y),
    };
  });
  const maxRows = Math.max(1, ...rows.values());
  return {
    width: PAD * 2 + kinds.length * NODE_W + Math.max(0, kinds.length - 1) * GAP_X,
    height: PAD * 2 + maxRows * NODE_H + (maxRows - 1) * GAP_Y,
    placed,
    rows: maxRows,
    kinds,
  };
}

/** Word-wrap an edge label into at most two lines of LABEL_LINE_CHARS; overflow ends in "…". */
export function wrapLabel(label: string): string[] {
  const lines: string[] = [];
  let rest = label.trim();
  while (rest && lines.length < LABEL_MAX_LINES) {
    const chars = Array.from(rest);
    if (chars.length <= LABEL_LINE_CHARS) {
      lines.push(rest);
      rest = "";
      break;
    }
    const head = chars.slice(0, LABEL_LINE_CHARS + 1).join("");
    const cut = head.lastIndexOf(" ");
    const line = cut > 0 ? head.slice(0, cut) : chars.slice(0, LABEL_LINE_CHARS).join("");
    lines.push(line);
    rest = rest.slice(line.length).trim();
  }
  if (rest) {
    const last = Array.from(lines[lines.length - 1]!);
    lines[lines.length - 1] = `${last.slice(0, LABEL_LINE_CHARS - 1).join("").trimEnd()}…`;
  }
  return lines;
}

/** Pill size for wrapped label lines. */
export function labelBox(lines: string[]): { w: number; h: number } {
  const longest = Math.max(...lines.map((l) => Array.from(l).length));
  return { w: longest * LABEL_CHAR_W + LABEL_PAD_X * 2, h: lines.length * LABEL_LINE_H + LABEL_PAD_Y * 2 };
}

export interface EdgeGeometry {
  d: string;
  /** Label anchor (centre): in the column gap next to the target, just above the arrowhead. */
  lx: number;
  ly: number;
  /** Y of the horizontal run when the edge skips columns (routed between rows). */
  lane?: number;
}

/** Nearest inter-row lane to `y`; lanes sit in the GAP_Y strips, which no node ever occupies. */
function laneNear(y: number, layout: Layout): number {
  const lanes = [PAD / 2, layout.height - PAD / 2]; // above the top row, below the bottom one
  for (let k = 1; k < layout.rows; k += 1) lanes.push(PAD + k * (NODE_H + GAP_Y) - GAP_Y / 2);
  return lanes.reduce((best, lane) => (Math.abs(lane - y) < Math.abs(best - y) ? lane : best));
}

/** Path from one node to another, picking the facing sides. Edges that skip a column
    travel along an empty lane between rows so they never pass under an unrelated node. */
export function edgePath(
  a: PlacedNode,
  b: PlacedNode,
  layout: Layout,
  /** Edges already routed per lane; later edges on the same lane are offset so they stay distinct. */
  laneUse: Map<number, number> = new Map(),
): EdgeGeometry {
  const ay = a.y + NODE_H / 2;
  const by = b.y + NODE_H / 2;
  const labelY = by - LABEL_LINE_H / 2 - LABEL_PAD_Y - 3;
  if (a.x === b.x) {
    // Same column: bow out to the right; label sits in the gap beside the target.
    const x = a.x + NODE_W;
    const bow = x + 28;
    return { d: `M ${x} ${ay} C ${bow} ${ay}, ${bow} ${by}, ${x} ${by}`, lx: x + GAP_X / 2 + 8, ly: by };
  }
  const forward = b.x > a.x;
  const ax = forward ? a.x + NODE_W : a.x;
  const bx = forward ? b.x : b.x + NODE_W;
  const half = forward ? GAP_X / 2 : -GAP_X / 2;
  const lx = bx - half;
  const span = Math.round(Math.abs(b.x - a.x) / (NODE_W + GAP_X));
  if (span <= 1) {
    const mid = (ax + bx) / 2;
    return { d: `M ${ax} ${ay} C ${mid} ${ay}, ${mid} ${by}, ${bx} ${by}`, lx, ly: labelY };
  }
  const base = laneNear((ay + by) / 2, layout);
  const used = laneUse.get(base) ?? 0;
  laneUse.set(base, used + 1);
  const step = Math.ceil(used / 2) * LANE_STEP * (used % 2 === 1 ? -1 : 1); // 0, -5, +5, -10, …
  const lane = Math.min(layout.height - 2, Math.max(2, base + step));
  const x1 = ax + half;
  const x2 = bx - half;
  const d = [
    `M ${ax} ${ay}`,
    `C ${x1} ${ay}, ${ax} ${lane}, ${x1} ${lane}`,
    `L ${x2} ${lane}`,
    `C ${bx} ${lane}, ${x2} ${by}, ${bx} ${by}`,
  ].join(" ");
  return { d, lx, ly: labelY, lane };
}

export interface LabelSpot {
  lines: string[];
  x: number;
  /** Centre of the pill. */
  y: number;
}

/** Push overlapping labels apart vertically (greedy, top to bottom). Returns a new array
    in input order; only `y` changes. */
export function layoutLabels<T extends LabelSpot>(labels: T[]): T[] {
  const out = labels.map((l) => ({ ...l }));
  const order = [...out].sort((p, q) => p.y - q.y || p.x - q.x);
  const placed: T[] = [];
  for (const l of order) {
    const box = labelBox(l.lines);
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of placed) {
        const pb = labelBox(p.lines);
        const overlapX = Math.abs(p.x - l.x) < (pb.w + box.w) / 2;
        if (overlapX && Math.abs(p.y - l.y) < (pb.h + box.h) / 2) {
          l.y = p.y + (pb.h + box.h) / 2 + 2;
          moved = true;
        }
      }
    }
    placed.push(l);
  }
  return out;
}

/** Below this the 10px labels stop being readable; the diagram scrolls horizontally instead. */
export const MIN_SCALE = 0.85;

/** Scale that fits a `contentWidth` diagram into `available` px (never upscales; 0 = not measured). */
export function fitScale(available: number, contentWidth: number): number {
  if (available <= 0 || contentWidth <= 0) return 1;
  return Math.max(MIN_SCALE, Math.min(1, available / contentWidth));
}
