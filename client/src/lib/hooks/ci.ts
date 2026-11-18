/* hooks/ci.ts — React Query hooks for Export-to-CI: the agent's CI tab, the wizard
   (preview / export) and the CI Runs page. Global staleTime is 30s, so every mutation
   invalidates exactly the keys it affects. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentCi,
  CiExport,
  CiExportInputBody,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRunsList,
} from "@devdigest/shared";

type Id = string | null | undefined;

/** Body for the wizard's preview call — `triggers` / `post_as` are always sent explicitly. */
export type CiPreviewBody = Pick<CiPreviewInput, "repo" | "triggers" | "post_as">;

export function useAgentCi(agentId: Id) {
  return useQuery({
    queryKey: ["agent-ci", agentId],
    queryFn: () => api.get<AgentCi>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
  });
}

export function useCiPreview(agentId: string) {
  return useMutation({
    mutationFn: (body: CiPreviewBody) => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, body),
  });
}

/** Export as a PR (`action: "open_pr"`). */
export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiExportInputBody) => api.post<CiExport>(`/agents/${agentId}/export-ci`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-ci", agentId] }),
  });
}

/** Browser download of a Blob via a temporary `<a download>`. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Export as a zip (`action: "zip"`) and download it. */
export function useExportCiZip(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CiExportInputBody) => {
      const blob = await api.postBlob(`/agents/${agentId}/export-ci`, { ...body, action: "zip" });
      downloadBlob(blob, "devdigest-ci.zip");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-ci", agentId] }),
  });
}

export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs"],
    queryFn: () => api.get<CiRunsList>("/ci/runs"),
  });
}

export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci/runs/refresh"),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["ci-runs"] }),
        qc.invalidateQueries({ queryKey: ["agent-ci"] }),
      ]),
  });
}
