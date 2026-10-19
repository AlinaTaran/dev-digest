"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import type { BlastRadiusResponse } from "@/lib/types";
import { SymbolNode } from "./SymbolNode";
import { ImpactChips } from "./ImpactChips";
import { dedupeBy, initialExpanded } from "./helpers";
import { s } from "./styles";

interface SymbolTreeProps {
  data: BlastRadiusResponse;
  repoFullName: string | null;
  headSha: string;
}

const keyOf = (entry: { file: string; symbol: string }) => `${entry.file}:${entry.symbol}`;

/** Mount with `key={prId}` so the lazy initial expansion resets per PR. */
export function SymbolTree({ data, repoFullName, headSha }: SymbolTreeProps) {
  const t = useTranslations("blast");
  const entries = dedupeBy(data.downstream, keyOf);
  const [expanded, setExpanded] = useState(() => initialExpanded(entries.map(keyOf)));

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (data.changed_symbols.length === 0) return <p style={s.muted}>{t("noSymbols")}</p>;

  const attributed = new Set(entries.flatMap((e) => e.endpoints_affected));
  const unattributed = data.impacted_endpoints.filter((e) => !attributed.has(e));

  return (
    <div>
      {data.stats.callers === 0 && (
        <p style={s.muted}>{t("noDownstream", { count: data.stats.symbols })}</p>
      )}
      <div style={s.tree}>
        {entries.map((entry) => (
          <SymbolNode
            key={keyOf(entry)}
            entry={entry}
            expanded={expanded.has(keyOf(entry))}
            onToggle={() => toggle(keyOf(entry))}
            repoFullName={repoFullName}
            indexedSha={data.indexed_sha}
            headSha={headSha}
            maxCallers={data.max_callers_per_symbol}
          />
        ))}
      </div>
      {unattributed.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={s.muted}>{t("unattributed")}</p>
          <ImpactChips items={unattributed} tone="endpoint" label={t("endpoints")} />
        </div>
      )}
      <p style={{ ...s.muted, marginTop: 10 }}>{t("depthNote", { depth: data.bfs_depth })}</p>
    </div>
  );
}
