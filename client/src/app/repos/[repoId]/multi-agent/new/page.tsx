import { Suspense } from "react";
import { ConfigureRunView } from "../_components/ConfigureRunView/ConfigureRunView";

/* Route: /repos/:repoId/multi-agent/new — Configure run. Thin entry; the view reads
   ?pr= via useSearchParams, so it needs a Suspense boundary. */
export default function ConfigureRunPage() {
  return (
    <Suspense fallback={null}>
      <ConfigureRunView />
    </Suspense>
  );
}
