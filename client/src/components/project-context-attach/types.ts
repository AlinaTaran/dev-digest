/** Pre-formatted strings for the shared attach list — it never calls `useTranslations`. */
export interface ContextAttachLabels {
  filterPlaceholder: string;
  filterAria: string;
  counter: string;
  inheritedGroup: string;
  emptyAttached: string;
  emptyFiltered: string;
  missing: string;
  tooLarge: string;
  duplicate: string;
  footerTokens: (n: number) => string;
  caption: string;
  tokens: (n: number | null) => string;
  viaSkill: (skill: string) => string;
  typeLabel: (type: string) => string;
  dragHandle: (path: string) => string;
  moveUp: (path: string) => string;
  moveDown: (path: string) => string;
  remove: (path: string) => string;
  preview: (path: string) => string;
  /** Visible text of the row preview button. */
  previewText: string;
}

export interface ContextPreviewLabels {
  loading: string;
  error: string;
  tokens: (n: number) => string;
  typeLabel: (type: string) => string;
  usedBy: (count: number) => string;
}
