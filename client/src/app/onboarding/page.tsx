/* Legacy /onboarding route — the Add-repository screen moved to /repos/new. */
import { redirect, RedirectType } from "next/navigation";

export default function OnboardingRedirect() {
  redirect("/repos/new", RedirectType.replace);
}
