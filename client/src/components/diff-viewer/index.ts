/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer/DiffViewer";
export { SmartDiffViewer } from "./SmartDiffViewer/SmartDiffViewer";
export { dedupeFilesByPath } from "./helpers";
export type { DiffCommentApi } from "./comments";
