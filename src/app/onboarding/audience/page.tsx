import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { AudienceForm } from "./AudienceForm";
import { OnboardingNotices } from "@/components/OnboardingNotices";

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
      notices={<OnboardingNotices />}
      role="audience"
      name={profile.full_name}
      subtitle="Just a few details so you can start unlocking sponsor-funded rewards."
    >
      {/* A survey sign-up already gave us a mobile number (FB-00032) —
          don't make them type it twice. */}
      {/* …nor their name, typed at sign-up a moment ago (16 Oct: an empty
          required name field made "Finish" look like it did nothing). */}
      <AudienceForm
        mode="onboarding"
        defaults={{ full_name: profile.full_name ?? undefined, ...surveyPhoneDefaults(user.user_metadata) }}
      />
    </OnboardingShell>
  );
}
