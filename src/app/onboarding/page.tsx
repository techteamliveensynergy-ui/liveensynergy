import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { needsGoogleCompletion } from "@/lib/google-auth";

/**
 * Onboarding entry point. Routes the user to the form for their role, or to
 * the dashboard if they've already completed onboarding.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { user, profile } = await requireProfile();
  // Carried on so the next screen can say "your email is confirmed".
  const suffix = (await searchParams).confirmed ? "?confirmed=1" : "";

  if (!profile) {
    // Profile trigger hasn't run yet — send them to the dashboard which will
    // re-check, rather than looping.
    redirect("/dashboard");
  }

  if (needsGoogleCompletion(user, profile)) {
    redirect("/auth/complete?next=/onboarding");
  }

  if (profile.onboarding_completed) {
    redirect(`/dashboard${suffix}`);
  }

  redirect(`/onboarding/${profile.role}${suffix}`);
}
