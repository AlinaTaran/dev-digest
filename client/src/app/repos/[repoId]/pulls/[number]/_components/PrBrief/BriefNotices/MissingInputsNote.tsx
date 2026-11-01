"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BriefMissingInput } from "@devdigest/shared";
import { missingInputsList } from "../helpers";
import { s } from "../styles";

export function MissingInputsNote({ missing }: { missing: BriefMissingInput[] }) {
  const t = useTranslations("brief");
  if (missing.length === 0) return null;
  return <p style={s.note}>{t("prBrief.missingInputs", { list: missingInputsList(missing, t) })}</p>;
}
