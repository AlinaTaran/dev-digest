/* hooks/context.ts — React Query hooks for Project Context: the repo doc
   listing/preview/edit and the agent/skill attachment sets. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContextListing,
  ContextDocDetail,
  ContextDocSaveBody,
  ContextDocSaveResult,
  AgentContextResponse,
  SkillContextResponse,
} from "@devdigest/shared";

type Id = string | null | undefined;

export function useContextListing(repoId: Id) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** Rescan the clone (same body as the GET); the listing refetches afterwards. */
export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<ContextListing>(`/repos/${repoId}/context/reindex`),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: ["context", repoId] }),
  });
}

export function useContextDoc(repoId: Id, path: Id) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () =>
      api.get<ContextDocDetail>(`/repos/${repoId}/context/doc?path=${encodeURIComponent(path as string)}`),
    enabled: !!repoId && !!path,
  });
}

export function useSaveContextDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, ...body }: ContextDocSaveBody & { repoId: string }) =>
      api.put<ContextDocSaveResult>(`/repos/${repoId}/context/doc`, body),
    // Write the saved content + fresh hash into the cache first so the editor never
    // shows stale text or sends a stale base_hash, then stay pending until the
    // dependent refetches settle (returned promise is awaited by TanStack).
    onSuccess: (d, v) => {
      qc.setQueryData<ContextDocDetail>(["context-doc", v.repoId, v.path], (old) =>
        old
          ? { ...old, content: v.content, content_hash: d.content_hash, tokens: d.tokens, size_bytes: d.size_bytes }
          : old,
      );
      return Promise.all([
        qc.invalidateQueries({ queryKey: ["context", v.repoId] }),
        qc.invalidateQueries({ queryKey: ["context-doc", v.repoId, v.path] }),
        // Token totals in the agent/skill tabs depend on the saved content.
        qc.invalidateQueries({ queryKey: ["agent-context"] }),
        qc.invalidateQueries({ queryKey: ["skill-context"] }),
      ]);
    },
  });
}

export function useAgentContext(agentId: Id, repoId: Id) {
  return useQuery({
    queryKey: ["agent-context", agentId, repoId],
    queryFn: () => api.get<AgentContextResponse>(`/agents/${agentId}/context?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

export function usePutAgentContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, repo_id, paths }: { agentId: string; repo_id: string; paths: string[] }) =>
      api.put<AgentContextResponse>(`/agents/${agentId}/context`, { repo_id, paths }),
    // Cache the PUT response (fresh list) and stay pending until the rest settle,
    // so a fast second toggle never builds its replace-all from a stale list.
    onSuccess: (d, v) => {
      qc.setQueryData<AgentContextResponse>(["agent-context", v.agentId, v.repo_id], d);
      return Promise.all([
        qc.invalidateQueries({ queryKey: ["context", v.repo_id] }),
        // Doc details carry "used by N agents" — refresh any open preview.
        qc.invalidateQueries({ queryKey: ["context-doc", v.repo_id] }),
      ]);
    },
  });
}

export function useSkillContext(skillId: Id, repoId: Id) {
  return useQuery({
    queryKey: ["skill-context", skillId, repoId],
    queryFn: () => api.get<SkillContextResponse>(`/skills/${skillId}/context?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

/** A skill's docs are inherited by its agents, so agent contexts refetch too. */
export function usePutSkillContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, repo_id, paths }: { skillId: string; repo_id: string; paths: string[] }) =>
      api.put<SkillContextResponse>(`/skills/${skillId}/context`, { repo_id, paths }),
    onSuccess: (d, v) => {
      qc.setQueryData<SkillContextResponse>(["skill-context", v.skillId, v.repo_id], d);
      return Promise.all([
        qc.invalidateQueries({ queryKey: ["agent-context"] }),
        // Other skills' keys; the one just written is already fresh but a refetch is harmless.
        qc.invalidateQueries({ queryKey: ["skill-context"] }),
        qc.invalidateQueries({ queryKey: ["context", v.repo_id] }),
        qc.invalidateQueries({ queryKey: ["context-doc", v.repo_id] }),
      ]);
    },
  });
}
