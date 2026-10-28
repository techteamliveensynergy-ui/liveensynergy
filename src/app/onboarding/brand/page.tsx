import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { loadDraft } from "@/lib/drafts";
import { BrandForm } from "./BrandForm";
import { OnboardingNotices } from "@/components/OnboardingNotices";

export const metadata = { title: "Set up your brand" };

export default async function BrandOnboardingPage() {
  const { profile } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "brand") redirect(`/onboarding/${profile.role}`);
  // "Save and finish later" (#79) brings them back to what they'd typed.
  const draft = await loadDraft(await createClient(), profile.id, "onboarding_brand");

  return (
    <OnboardingShell
      notices={<OnboardingNotices />}
      role="brand"
      name={profile.full_name}
      subtitle="Complete your profile so our team can match you with the right artists and events."
    >
      <BrandForm mode="onboarding" draft={draft} />
    </OnboardingShell>
  );
}
