"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePulls } from "@/lib/hooks";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { estimateTotal } from "@/lib/multi-agent-estimates";

/** State + orchestration for the Configure run form. Remount per repo (key) resets it. */
export function useConfigureRun(repoId: string) {
  const router = useRouter();
  const search = useSearchParams();
  const pulls = usePulls(repoId);
  const agents = useAgents();
  const estimates = useAgentEstimates();
  const start = useStartMultiAgentRun();
  const [prNumber, setPrNumber] = React.useState<string>(search.get("pr") ?? "");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [failed, setFailed] = React.useState(false);
  const inFlight = React.useRef(false);

  const pr = (pulls.data ?? []).find((p) => String(p.number) === prNumber) ?? null;
  const agentList = agents.data ?? [];
  const canLaunch = !!pr?.id && selected.length >= 2 && !start.isPending;
  const total = estimateTotal(selected, estimates.data);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const selectAll = () => setSelected(agentList.map((a) => a.id));
  const clear = () => setSelected([]);

  const launch = async () => {
    if (!canLaunch || !pr?.id || inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    try {
      await start.mutateAsync({ prId: pr.id, agentIds: selected });
      router.push(`/repos/${repoId}/multi-agent/${pr.number}`);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
    }
  };

  return {
    pulls,
    agents,
    estimates: estimates.data,
    agentList,
    prNumber,
    setPrNumber,
    pr,
    selected,
    toggle,
    selectAll,
    clear,
    total,
    canLaunch,
    launch,
    launching: start.isPending,
    failed,
  };
}
