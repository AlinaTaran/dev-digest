import type { BlastRadiusResponse } from "@/lib/types";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron" | "more";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Ellipsized text drawn in the node. */
  label: string;
  /** Full, un-ellipsized name (used for the accessible `<title>`). */
  name: string;
  /** `file:line` for callers, otherwise the full name. */
  title: string;
  /** Hidden-item count, `more` nodes only. */
  count?: number;
  x: number;
  y: number;
  w: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  dashed: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export const NODE_W = 168;
export const NODE_H = 30;
const COL_GAP = 72;
const ROW_GAP = 10;
const PAD = 12;
const LABEL_BUDGET = 20;
const DEFAULT_MAX_PER_COLUMN = 12;

export function ellipsize(text: string, max = LABEL_BUDGET): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

interface Item {
  id: string;
  kind: Exclude<GraphNodeKind, "more">;
  name: string;
  title: string;
}

/** Cap a column at `max` rows; the overflow collapses into a trailing `more` item. */
function capColumn(items: Item[], max: number): { shown: Item[]; hidden: number } {
  if (items.length <= max) return { shown: items, hidden: 0 };
  const keep = Math.max(0, max - 1);
  return { shown: items.slice(0, keep), hidden: items.length - keep };
}

function uniqueBy<T>(list: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const endpointItem = (name: string): Item => ({ id: `endpoint:${name}`, kind: "endpoint", name, title: name });
const cronItem = (name: string): Item => ({ id: `cron:${name}`, kind: "cron", name, title: name });

const symbolKey = (d: { file: string; symbol: string }) => `${d.file}:${d.symbol}`;

export function layoutBlastGraph(
  data: BlastRadiusResponse,
  { maxPerColumn = DEFAULT_MAX_PER_COLUMN }: { maxPerColumn?: number } = {},
): GraphLayout {
  const symbolEntries = uniqueBy(data.downstream, symbolKey);
  const symbolItems: Item[] = symbolEntries.map((d) => ({
    id: `symbol:${symbolKey(d)}`,
    kind: "symbol",
    name: d.symbol,
    title: d.symbol,
  }));

  const symbolCol = capColumn(symbolItems, maxPerColumn);
  const shownSymbolIds = new Set(symbolCol.shown.map((i) => i.id));
  const shownEntries = symbolEntries.filter((d) => shownSymbolIds.has(`symbol:${symbolKey(d)}`));

  // Callers are shared across shown symbols: one node per file:name.
  const callerByKey = new Map<string, Item>();
  for (const d of shownEntries) {
    for (const c of d.callers) {
      const key = `${c.file}:${c.name}`;
      if (!callerByKey.has(key)) {
        callerByKey.set(key, { id: `caller:${key}`, kind: "caller", name: c.name, title: `${c.file}:${c.line}` });
      }
    }
  }
  const callerCol = capColumn([...callerByKey.values()], maxPerColumn);
  const shownCallerIds = new Set(callerCol.shown.map((i) => i.id));

  // Endpoint/cron candidates, in the order they are first mentioned.
  const targets: Item[] = [];
  for (const d of shownEntries) {
    for (const c of d.callers) {
      if (!shownCallerIds.has(`caller:${c.file}:${c.name}`)) continue;
      targets.push(...c.endpoints.map(endpointItem), ...c.crons.map(cronItem));
    }
  }
  for (const d of shownEntries) {
    targets.push(...d.endpoints_affected.map(endpointItem), ...d.crons_affected.map(cronItem));
  }
  const hasAttributed = targets.length > 0;
  if (!hasAttributed) targets.push(...data.impacted_endpoints.map(endpointItem));
  const uniqueTargets = uniqueBy(targets, (t) => t.id);
  const endpointItems = uniqueTargets.filter((t) => t.kind === "endpoint");
  const cronItems = uniqueTargets.filter((t) => t.kind === "cron");
  const targetCol = capColumn([...endpointItems, ...cronItems], maxPerColumn);
  const shownTargetIds = new Set(targetCol.shown.map((i) => i.id));

  // Edges.
  const edges = new Map<string, GraphEdge>();
  const addEdge = (from: string, to: string, dashed: boolean) => {
    const id = `${from}->${to}`;
    if (!edges.has(id)) edges.set(id, { id, from, to, dashed });
  };
  for (const d of shownEntries) {
    const symId = `symbol:${symbolKey(d)}`;
    const reached = new Set<string>();
    for (const c of d.callers) {
      const callerId = `caller:${c.file}:${c.name}`;
      if (!shownCallerIds.has(callerId)) continue;
      addEdge(symId, callerId, false);
      for (const t of [...c.endpoints.map(endpointItem), ...c.crons.map(cronItem)]) {
        reached.add(t.id);
        if (shownTargetIds.has(t.id)) addEdge(callerId, t.id, false);
      }
    }
    for (const t of [...d.endpoints_affected.map(endpointItem), ...d.crons_affected.map(cronItem)]) {
      if (!reached.has(t.id) && shownTargetIds.has(t.id)) addEdge(symId, t.id, true);
    }
    if (!hasAttributed) {
      for (const t of data.impacted_endpoints.map(endpointItem)) {
        if (shownTargetIds.has(t.id)) addEdge(symId, t.id, true);
      }
    }
  }

  // Positions: three columns, each vertically centered on the tallest.
  const columns = [
    { items: symbolCol.shown, hidden: symbolCol.hidden, moreId: "more:symbol" },
    { items: callerCol.shown, hidden: callerCol.hidden, moreId: "more:caller" },
    { items: targetCol.shown, hidden: targetCol.hidden, moreId: "more:target" },
  ];
  const rows = (c: (typeof columns)[number]) => c.items.length + (c.hidden > 0 ? 1 : 0);
  const maxRows = Math.max(1, ...columns.map(rows));
  const innerH = maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const nodes: GraphNode[] = [];
  columns.forEach((col, ci) => {
    const x = PAD + ci * (NODE_W + COL_GAP);
    const n = rows(col);
    const top = PAD + (innerH - (n * NODE_H + Math.max(0, n - 1) * ROW_GAP)) / 2;
    col.items.forEach((item, ri) => {
      const label = item.kind === "symbol" ? `${item.name}()` : item.name;
      nodes.push({
        id: item.id,
        kind: item.kind,
        label: ellipsize(label),
        name: item.name,
        title: item.title,
        x,
        y: top + ri * (NODE_H + ROW_GAP),
        w: NODE_W,
      });
    });
    if (col.hidden > 0) {
      nodes.push({
        id: col.moreId,
        kind: "more",
        label: String(col.hidden),
        name: String(col.hidden),
        title: String(col.hidden),
        count: col.hidden,
        x,
        y: top + col.items.length * (NODE_H + ROW_GAP),
        w: NODE_W,
      });
    }
  });

  return {
    nodes,
    edges: [...edges.values()],
    width: PAD * 2 + 3 * NODE_W + 2 * COL_GAP,
    height: PAD * 2 + innerH,
  };
}
