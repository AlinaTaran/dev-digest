import { Suspense } from "react";
import { AgentEvalDashboardView } from "../_components/AgentEvalDashboardView/AgentEvalDashboardView";

/* Route: /eval/[agentId]. Thin route entry — the view, styles and helpers are colocated under
   _components/AgentEvalDashboardView. Suspense: the view reads ?days= via useSearchParams. */
export default async function AgentEvalPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return (
    <Suspense>
      <AgentEvalDashboardView agentId={agentId} />
    </Suspense>
  );
}
