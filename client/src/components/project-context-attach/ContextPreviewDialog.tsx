"use client";

import React from "react";
import { Drawer, Markdown, Badge } from "@devdigest/ui";
import { useContextDoc } from "../../lib/hooks/context";
import { contextDocTypeTone, splitPath } from "./helpers";
import type { ContextPreviewLabels } from "./types";
import { s } from "./styles";

const DRAWER_WIDTH = 640;

/**
 * Read-only preview of one repo doc in a right-hand drawer: file name, full path, type, tokens,
 * "used by" count and the rendered Markdown. Esc / focus trap / focus restore come from the kit Drawer.
 */
export function ContextPreviewDialog({
  repoId,
  path,
  labels,
  onClose,
}: {
  repoId: string;
  path: string;
  labels: ContextPreviewLabels;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useContextDoc(repoId, path);
  const usedBy = data ? new Set(data.used_by_agents.map((u) => u.agent_id)).size : 0;

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={<span className="mono">{splitPath(path).name}</span>}
      subtitle={<span className="mono" style={s.previewPath}>{path}</span>}
      onClose={onClose}
    >
      {data && (
        <div style={s.previewMeta}>
          <Badge {...contextDocTypeTone(data.type)}>{labels.typeLabel(data.type)}</Badge>
          <Badge mono>{labels.tokens(data.tokens)}</Badge>
          {usedBy > 0 && <Badge>{labels.usedBy(usedBy)}</Badge>}
        </div>
      )}
      <div style={s.previewBody}>
        {isLoading && <span>{labels.loading}</span>}
        {isError && <span role="alert">{labels.error}</span>}
        {data && <Markdown>{data.content}</Markdown>}
      </div>
    </Drawer>
  );
}
