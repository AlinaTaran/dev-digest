"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton, ErrorState } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks/pr-history";
import { PriorPrItem } from "./PriorPrItem";
import { dedupeByPrNumber } from "./helpers";
import { s } from "./styles";

export function PriorPrs({ prId, repoFullName }: { prId: string | null; repoFullName: string | null }) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(false);
  // Lazy: nothing is fetched until the section is first expanded.
  const query = usePrHistory(prId, open);
  const data = query.data;
  const items = data ? dedupeByPrNumber(data.history) : [];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <section style={s.box}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={s.header}>
        <Icon.History size={16} />
        <span>{t("history.title")}</span>
        {data && !data.degraded && <span style={s.badge}>{items.length}</span>}
        <span style={s.spacer} />
        <Chevron size={16} />
      </button>

      {open && (
        <div style={s.body}>
          {query.isLoading ? (
            <div style={s.skeletonStack}>
              <Skeleton height={14} width="60%" />
              <Skeleton height={12} width="40%" />
              <Skeleton height={12} width="80%" />
            </div>
          ) : query.isError ? (
            <ErrorState
              title={t("history.error.title")}
              body={t("history.error.body")}
              onRetry={() => query.refetch()}
            />
          ) : data?.degraded && data.reason ? (
            <p style={s.muted}>{t(`history.reason.${data.reason}`)}</p>
          ) : data && items.length === 0 ? (
            <p style={s.muted}>{t("history.empty")}</p>
          ) : data ? (
            <ul style={s.list}>
              {items.map((item) => (
                <PriorPrItem key={item.pr_number} item={item} repoFullName={repoFullName} />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
