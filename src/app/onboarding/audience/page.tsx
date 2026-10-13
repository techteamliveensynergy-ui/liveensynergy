import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { AudienceForm } from "./AudienceForm";

export const metadata = { title: "Complete your profile" };

function surveyPhoneDefaults(meta: Record<string, unknown> | undefined) {
  const phone = typeof meta?.phone === "string" ? meta.phone : null;
  if (!phone) return undefined;
  const code = typeof meta?.phone_country_code === "string" ? meta.phone_country_code : "+44";
  return { phone, phone_country_code: code };
}

export default async function AudienceOnboardingPage() {
  const { profile, user } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "audience") redirect(`/onboarding/${profile.role}`);

  return (
    <OnboardingShell
      role="audience"
      title="Complete your profile"
      subtitle="Just a few details so you can start unlocking sponsor-funded rewards."
    >
      {/* A survey sign-up already gave us a mobile number (FB-00032) —
          don't make them type it twice. */}
      <AudienceForm mode="onboarding" defaults={surveyPhoneDefaults(user.user_metadata)} />
    </OnboardingShell>
  );
}
