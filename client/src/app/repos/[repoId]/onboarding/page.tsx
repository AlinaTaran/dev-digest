/* Onboarding Tour — /repos/:repoId/onboarding. Thin route: the view owns data + UI. */
import React from "react";
import { OnboardingView } from "./_components/OnboardingView/OnboardingView";

export default async function OnboardingTourPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <OnboardingView repoId={repoId} />;
}
