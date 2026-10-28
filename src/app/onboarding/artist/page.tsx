import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { loadDraft } from "@/lib/drafts";
import { ArtistForm } from "./ArtistForm";
import { OnboardingNotices } from "@/components/OnboardingNotices";

export const metadata = { title: "Set up your profile" };

export default async function ArtistOnboardingPage() {
  const { profile } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "artist") redirect(`/onboarding/${profile.role}`);
  // "Save and finish later" (#79) brings them back to what they'd typed.
  const draft = await loadDraft(await createClient(), profile.id, "onboarding_artist");

  return (
    <OnboardingShell
      notices={<OnboardingNotices />}
      role="artist"
      name={profile.full_name}
      subtitle="Artist or event organiser — tell brands who you are and what you can offer as a sponsorship partner."
    >
      {/* Contact person starts as the account holder — editable. */}
      <ArtistForm
        mode="onboarding"
        draft={draft}
        defaults={{ contact_name: profile.full_name ?? undefined, contact_email: profile.email ?? undefined }}
      />
    </OnboardingShell>
  );
}
