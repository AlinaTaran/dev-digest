import type { useTranslations } from "next-intl";
import type { ContextAttachLabels, ContextPreviewLabels } from "./types";

/** Translator for the `context` namespace (all `attach.*` keys live there). */
export type ContextTranslator = ReturnType<typeof useTranslations<"context">>;

/** Build the shared list's labels from the `context` namespace. */
export function buildAttachLabels(
  t: ContextTranslator,
  attached: number,
  total: number,
  compactCounter = false,
): ContextAttachLabels {
  return {
    filterPlaceholder: t("attach.filterPlaceholder"),
    filterAria: t("attach.filterPlaceholder"),
    counter: compactCounter ? t("attach.counterShort", { attached }) : t("attach.counter", { attached, total }),
    inheritedGroup: t("attach.inheritedGroup"),
    emptyAttached: t("attach.emptyAttached"),
    emptyFiltered: t("attach.emptyFiltered"),
    missing: t("attach.missing"),
    tooLarge: t("attach.tooLarge"),
    duplicate: t("attach.duplicate"),
    footerTokens: (n) => t("attach.footerTokens", { count: n }),
    caption: t("attach.caption"),
    tokens: (n) => (n == null ? t("attach.tokensUnknown") : t("attach.tokens", { count: n })),
    viaSkill: (skill) => t("attach.viaSkill", { skill }),
    typeLabel: (type) => typeLabel(t, type),
    dragHandle: (path) => t("attach.dragHandle", { path }),
    moveUp: (path) => t("attach.moveUp", { path }),
    moveDown: (path) => t("attach.moveDown", { path }),
    remove: (path) => t("attach.remove", { path }),
    preview: (path) => t("attach.preview", { path }),
    previewText: t("attach.previewText"),
  };
}

export function buildPreviewLabels(t: ContextTranslator): ContextPreviewLabels {
  return {
    loading: t("attach.previewLoading"),
    error: t("attach.previewError"),
    tokens: (n) => t("attach.previewTokens", { count: n }),
    typeLabel: (type) => typeLabel(t, type),
    usedBy: (count) => t("attach.previewUsedBy", { count }),
  };
}

function typeLabel(t: ContextTranslator, type: string): string {
  switch (type) {
    case "specs":
    case "docs":
    case "insights":
      return t(`attach.type.${type}`);
    default:
      return t("attach.type.other");
  }
}
