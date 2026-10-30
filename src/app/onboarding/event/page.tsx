import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { loadDraft } from "@/lib/drafts";
import { EventForm } from "./EventForm";
import { OnboardingNotices } from "@/components/OnboardingNotices";

export const metadata = { title: "Set up your event profile" };

export default async function EventOnboardingPage() {
  const { profile } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "event") redirect(`/onboarding/${profile.role}`);
  // "Save and finish later" (#79) brings them back to what they'd typed.
  const draft = await loadDraft(await createClient(), profile.id, "onboarding_event");

  return (
    <OnboardingShell
      notices={<OnboardingNotices />}
      role="event"
      name={profile.full_name}
      subtitle="Tell brands about your event and what you can offer as a partnership partner."
    >
      <EventForm mode="onboarding" draft={draft} />
    </OnboardingShell>
  );
}
