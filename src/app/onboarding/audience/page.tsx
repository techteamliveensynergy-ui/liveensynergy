import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { AudienceForm } from "./AudienceForm";

export const metadata = { title: "Complete your profile" };

export default async function AudienceOnboardingPage() {
  const { profile } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "audience") redirect(`/onboarding/${profile.role}`);

  return (
    <OnboardingShell
      role="audience"
      title="Complete your profile"
      subtitle="Just a few details so you can start unlocking sponsor-funded rewards."
    >
      <AudienceForm mode="onboarding" />
    </OnboardingShell>
  );
}
