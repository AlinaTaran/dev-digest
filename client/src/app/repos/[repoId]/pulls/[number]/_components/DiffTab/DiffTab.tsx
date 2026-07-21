"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, dedupeFilesByPath, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile, Finding } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Clicking a code-line severity chip jumps to that finding in "Agent runs". */
  onFindingClick?: (findingId: string) => void;
}

type Order = "smart" | "original";

export function DiffTab({ prId, filesCount, files, canComment, onFindingClick }: DiffTabProps) {
  const t = useTranslations("smart-diff");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const { data: smartDiff } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);

  // View state (order) lives in the URL, like the page's own ?tab/?trace params.
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const order: Order = searchParams.get("order") === "original" ? "original" : "smart";
  const setOrder = (next: Order) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "smart") sp.delete("order");
    else sp.set("order", next);
    const qs = sp.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  // The latest review's findings, grouped by file — the same data the server
  // used to compute `finding_lines`. Reviews come back newest-first.
  const findingsByPath = React.useMemo(() => {
    const map = new Map<string, Finding[]>();
    const latest = reviews?.[0];
    for (const f of latest?.findings ?? []) {
      const list = map.get(f.file) ?? [];
      list.push(f);
      map.set(f.file, list);
    }
    return map;
  }, [reviews]);

  // `pr.files` is not guaranteed unique per path (an import can emit several
  // diff fragments for one file); collapse them so cards keyed by `path` don't
  // collide as React keys. Feeds both the grouped and the fallback viewer.
  const uniqueFiles = React.useMemo(() => dedupeFilesByPath(files), [files]);

  const additions = uniqueFiles.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const deletions = uniqueFiles.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button kind="tertiary" size="sm" active={order === "smart"} onClick={() => setOrder("smart")}>
              {t("orderToggle.smart")}
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              active={order === "original"}
              onClick={() => setOrder("original")}
            >
              {t("orderToggle.original")}
            </Button>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        {t("sectionHeader.title")} · {t("sectionHeader.subline", { count: filesCount, additions, deletions })}
      </SectionLabel>

      {smartDiff ? (
        <SmartDiffViewer
          smartDiff={smartDiff}
          files={uniqueFiles}
          findingsByPath={findingsByPath}
          commenting={commenting}
          grouped={order === "smart"}
          onFindingClick={onFindingClick}
        />
      ) : (
        // Smart Diff still loading or unavailable — fall back to the plain
        // flat viewer so "Files changed" never blocks on the new endpoint.
        <DiffViewer files={uniqueFiles} commenting={commenting} />
      )}
    </section>
  );
}
