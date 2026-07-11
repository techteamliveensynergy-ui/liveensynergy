import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";

/**
 * Onboarding entry point. Routes the user to the form for their role, or to
 * the dashboard if they've already completed onboarding.
 */
export default async function OnboardingPage() {
  const { profile } = await requireProfile();

  if (!profile) {
    // Profile trigger hasn't run yet — send them to the dashboard which will
    // re-check, rather than looping.
    redirect("/dashboard");
  }

  if (profile.onboarding_completed) {
    redirect("/dashboard");
  }

  redirect(`/onboarding/${profile.role}`);
}
