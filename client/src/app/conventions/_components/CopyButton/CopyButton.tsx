"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";

/** Copy-to-clipboard icon button, scoped to the Conventions feature. Flips to
    a checkmark briefly after a successful copy (pure polish, no persisted
    state). */
export function CopyButton({ text }: { text: string }) {
  const t = useTranslations("conventions");
  const [copied, setCopied] = React.useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission denied / unavailable — silently no-op */
    }
  };

  return (
    <IconBtn
      icon={copied ? "Check" : "Copy"}
      label={copied ? t("card.copied") : t("card.copySnippet")}
      onClick={onClick}
    />
  );
}
