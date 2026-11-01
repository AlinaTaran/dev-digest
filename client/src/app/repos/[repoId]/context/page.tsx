/* Project Context — /repos/:repoId/context. Thin route: the view owns data + UI. */
import React from "react";
import { ProjectContextView } from "./_components/ProjectContextView/ProjectContextView";

export default async function ProjectContextPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <ProjectContextView repoId={repoId} />;
}
