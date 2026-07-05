/** Rough token estimate for the body editor — same ~4 chars/token convention
    used across the app (e.g. RunTraceDrawer's estimateTokenCount), colocated
    here to avoid a cross-feature import from the pulls feature. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}
