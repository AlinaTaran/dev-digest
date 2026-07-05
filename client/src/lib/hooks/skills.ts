/* hooks/skills.ts — React Query hooks for the Skills Lab (skill CRUD, versions,
   stats, import) + the agent<->skill link endpoints. Mirrors hooks/agents.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillType, SkillSource, AgentSkillLink } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Array<Skill & { agent_count: number }>>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface SkillVersion {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export interface SkillStats {
  used_by: number;
  agents: Array<{ id: string; name: string }>;
  findings_by_category: Array<{ category: string; count: number }>;
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: "extracted";
  ignored: string[];
}

/** Base64-encode a File's bytes without pulling in an external dependency. */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Import a .md/.zip file into an unsaved skill preview — does not persist
    anything; the caller confirms via a separate useCreateSkill() call. */
export function useImportSkill() {
  return useMutation({
    mutationFn: async (file: File) => {
      const content_base64 = await fileToBase64(file);
      return api.post<SkillImportPreview>("/skills/import", {
        filename: file.name,
        content_base64,
      });
    },
  });
}

/** The agent<->skill link endpoints return the bare link row (agent_id/skill_id/
    order) — NOT a joined skill object. Callers that need the full Skill must
    look it up (e.g. via useSkills()'s list) by skill_id themselves. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsInput {
  agentId: string;
  skillIds: string[];
}

export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: SetAgentSkillsInput) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, {
        skill_ids: skillIds,
      }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
}
