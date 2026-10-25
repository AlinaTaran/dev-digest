"use client";

import React from "react";
import type { Verdict } from "@devdigest/shared";
import { VerdictBanner } from "../../VerdictBanner/VerdictBanner";
import { s } from "../styles";

export interface BriefVerdict {
  verdict: Verdict;
  score: number | null;
  findingsCount: number;
  blockers: number;
}

/** The summary is model output: always a plain text node (AC-62). */
export function BriefSummary({ summary, verdict }: { summary: string; verdict?: BriefVerdict | null }) {
  return (
    <div style={s.summaryStack}>
      {verdict && (
        <VerdictBanner
          verdict={verdict.verdict}
          summary={null}
          score={verdict.score}
          findingsCount={verdict.findingsCount}
          blockers={verdict.blockers}
        />
      )}
      <p style={s.summary}>{summary}</p>
    </div>
  );
}
